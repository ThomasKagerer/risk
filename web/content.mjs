// The server supplies the installed package catalog. The core knows capabilities,
// not DLC IDs; old saved games resolve their unchanged rule ID through this table.
let catalog={packages:[],maps:[],rules:[]};
const helps=new Map();
export function configureContent(value){catalog=value;}
export function installedRules(){return catalog.rules;}
export function installedPackages(){return catalog.packages;}
export function mapConfig(id){return catalog.maps.find(map=>map.id===id)||{};}
export function ruleConfig(game){
  if(typeof game==='object'&&game?.ruleConfig)return game.ruleConfig;
  const id=typeof game==='string'?game:game?.rules;
  if(!id)return {revealedAttack:true,connectedMovement:true};
  return catalog.rules.find(rule=>rule.id===id)||{};
}
export function hasFeature(game,feature){return Boolean(ruleConfig(game)[feature]);}
export function registerRuleHelp(id,render){helps.set(id,render);}
export function customRuleHelp(game){return helps.get(game?.rules)?.(game);}
