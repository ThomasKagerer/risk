package main

import (
	"context"
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"
)

// Only a signature-verified Access assertion supplies identity. The separate
// Cf-Access-Authenticated-User-Email header is deliberately never trusted.
type accessUser struct {
	Email, Hash string
	Expires     time.Time
}
type accessContextKey struct{}

func currentUser(r *http.Request) accessUser {
	u, _ := r.Context().Value(accessContextKey{}).(accessUser)
	return u
}

type accessVerifier struct {
	issuer, audience   string
	client             *http.Client
	mu                 sync.Mutex
	keys               map[string]*rsa.PublicKey
	fetched, attempted time.Time
}

func newAccessVerifier(domain, audience string) (*accessVerifier, error) {
	if domain == "" && audience == "" {
		return nil, nil
	}
	domain = strings.TrimRight(domain, "/")
	u, err := url.Parse(domain)
	if err != nil || u.Scheme != "https" || !strings.HasSuffix(u.Host, ".cloudflareaccess.com") || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || audience == "" {
		return nil, errors.New("CLOUDFLARE_ACCESS_TEAM_DOMAIN (https://<team>.cloudflareaccess.com) und CLOUDFLARE_ACCESS_AUD müssen zusammen gesetzt sein")
	}
	return &accessVerifier{issuer: domain, audience: audience, client: &http.Client{Timeout: 5 * time.Second}}, nil
}

func (v *accessVerifier) publicKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	now := time.Now()
	if key := v.keys[kid]; key != nil && now.Sub(v.fetched) < time.Hour {
		return key, nil
	}
	// Unknown key IDs must not cause an unbounded stream of outbound requests.
	if now.Sub(v.attempted) < time.Minute {
		return nil, errors.New("Access-Schlüssel nicht verfügbar")
	}
	v.attempted = now
	req, err := http.NewRequestWithContext(ctx, "GET", v.issuer+"/cdn-cgi/access/certs", nil)
	if err != nil {
		return nil, err
	}
	res, err := v.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, errors.New("Access-Schlüssel konnten nicht geladen werden")
	}
	var jwks struct {
		Keys []struct{ Kid, Kty, Alg, Use, N, E string }
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 128<<10)).Decode(&jwks); err != nil {
		return nil, err
	}
	keys := make(map[string]*rsa.PublicKey)
	for _, k := range jwks.Keys {
		if k.Kty != "RSA" || k.Alg != "RS256" || (k.Use != "" && k.Use != "sig") || k.Kid == "" {
			continue
		}
		n, ne := base64.RawURLEncoding.DecodeString(k.N)
		e, ee := base64.RawURLEncoding.DecodeString(k.E)
		if ne != nil || ee != nil || len(n) < 256 || len(n) > 1024 || len(e) == 0 || len(e) > 4 {
			continue
		}
		exponent := new(big.Int).SetBytes(e).Int64()
		if exponent < 3 || exponent > 2147483647 || exponent%2 == 0 {
			continue
		}
		keys[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(exponent)}
	}
	if len(keys) == 0 {
		return nil, errors.New("Keine gültigen Access-Schlüssel")
	}
	v.keys, v.fetched = keys, now
	if key := keys[kid]; key != nil {
		return key, nil
	}
	return nil, errors.New("Unbekannter Access-Schlüssel")
}

func (v *accessVerifier) verify(ctx context.Context, token string) (accessUser, error) {
	invalid := errors.New("Cloudflare-Anmeldung abgelaufen oder ungültig. Bitte erneut anmelden.")
	if len(token) == 0 || len(token) > 16384 {
		return accessUser{}, invalid
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return accessUser{}, invalid
	}
	decode := func(s string, dst any) error {
		b, err := base64.RawURLEncoding.DecodeString(s)
		if err != nil {
			return err
		}
		return json.Unmarshal(b, dst)
	}
	var header struct{ Alg, Kid string }
	var claims struct {
		Iss, Email, Type string
		Aud              []string
		Exp, Nbf, Iat    int64
	}
	if decode(parts[0], &header) != nil || header.Alg != "RS256" || header.Kid == "" || decode(parts[1], &claims) != nil {
		return accessUser{}, invalid
	}
	now := time.Now().Unix()
	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if claims.Iss != v.issuer || !slices.Contains(claims.Aud, v.audience) || claims.Exp <= now || claims.Nbf > now+30 || claims.Iat > now+30 || claims.Type != "app" || len(email) > 254 || !strings.Contains(email, "@") {
		return accessUser{}, invalid
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return accessUser{}, invalid
	}
	key, err := v.publicKey(ctx, header.Kid)
	if err != nil {
		return accessUser{}, invalid
	}
	sum := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if rsa.VerifyPKCS1v15(key, crypto.SHA256, sum[:], sig) != nil {
		return accessUser{}, invalid
	}
	return accessUser{Email: email, Hash: hashToken(v.issuer + "\n" + email), Expires: time.Unix(claims.Exp, 0)}, nil
}
