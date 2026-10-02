import test from 'node:test';
import assert from 'node:assert/strict';
import { fixedCardValues, progressiveCardValue } from '../web/card-values.mjs';
import { rulesHTML } from '../web/rules.mjs';

test('mini world halves fixed and progressive card awards with integer rounding', () => {
 assert.deepEqual(fixedCardValues('simple-world'), [2,3,4,5]);
 assert.deepEqual(Array.from({length:10},(_,i)=>progressiveCardValue(i,'simple-world')), [2,3,4,5,6,7,10,12,15,17]);
 for (const map of ['classic','world120','europe1871']) {
  assert.deepEqual(fixedCardValues(map), [4,6,8,10]);
  assert.equal(progressiveCardValue(5,map),15);
  assert.equal(progressiveCardValue(7,map),25);
 }
 assert.match(rulesHTML({map:'simple-world',rules:'classic'}), /2, 3, 4, 5, 6, 7, 10, 12, 15, 17/);
 assert.match(rulesHTML({map:'simple-world',mode:'fixed'}), /Infanteriekarten bringen 2/);
});
