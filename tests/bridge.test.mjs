import test from 'node:test';
import assert from 'node:assert/strict';
import {amount,add,split,compare,name} from '../learning-lab/bridge.mjs';
test('mixed pieces construct exact eighths of a fixed whole',()=>{
  assert.deepEqual(add([4],2),[4,2]);
  assert.equal(amount([4,2,1]),7);
  assert.equal(amount([2,1]),3);
  assert.equal(add([4,2,1],2),null);
  assert.deepEqual(add([4,2,1],1),[4,2,1,1]);
});
test('splitting changes one selected piece, never the quantity or neighbors',()=>{
  const original=[4,2,1];
  assert.deepEqual(split(original,0),[2,2,2,1]);
  assert.deepEqual(split(original,1),[4,1,1,1]);
  assert.equal(split(original,2),null);
  assert.deepEqual(original,[4,2,1]);
  assert.equal(amount(split(original,0)),7);
});
test('all legal compositions retain quantity for every possible split',()=>{
  let checked=0;
  function visit(blocks,total){
    assert.equal(amount(blocks),total);
    blocks.forEach((n,i)=>{
      const result=split(blocks,i);
      if(n===1)assert.equal(result,null);
      else{assert.equal(amount(result),total);assert.equal(result.length,blocks.length+1);checked++;}
    });
    for(const n of [1,2,4])if(total+n<=8)visit([...blocks,n],total+n);
  }
  visit([],0);assert.ok(checked>100);
});
test('feedback guides correction without grading a learner',()=>{
  assert.match(compare([2,2],4),/ends match/);
  assert.match(compare([2],4),/Add a piece/);
  assert.match(compare([4,2],4),/Remove or replace/);
  assert.equal(name(3),'3/8');assert.equal(name(8),'1 whole');
});
test('invalid piece values, overflowing bridges, and unavailable selections are refused',()=>{
  for(const value of [[3],[8],[0],[-1],[1.5],[4,4,1],['2'],null])assert.throws(()=>amount(value));
  assert.throws(()=>add([],3));assert.throws(()=>compare([],3));
  for(const index of [-1,1,0.5,NaN])assert.equal(split([4],index),null);
});
