import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeHref } from '../src/routing.ts';

test('Law Diary sections preserve the reader passage and edition in their query', () => {
  const ref = {bookId:'JHN',chapter:3,verse:16,endVerse:18,editionId:'eng-bsb'};
  const link = routeHref('law-diary', ref).replace('/timeline?', '/social?');
  assert.deepEqual(parseRoute(link), {view:'law-diary',ref});
  assert.equal(parseRoute('#/law-diary/second-coming').ref.bookId, 'GEN');
});

test('new tools and existing reader routes retain exact source selections', () => {
  const ref = {bookId:'PSA',chapter:23,verse:1,editionId:'yor'};
  for (const view of ['read','compare','widget','ministry','speakers','editorial-workbench', 'linguistics', 'time-travel', 'nearby','support','tools']) {
    assert.deepEqual(parseRoute(routeHref(view, ref)), {view,ref});
  }
});

test('invalid passage values are not silently changed to a different verse', () => {
  assert.equal(parseRoute('#/read/JHN/3?verse=-1').ref.verse, -1);
  assert.ok(Number.isNaN(parseRoute('#/law-diary/money?chapter=invalid').ref.chapter));
  assert.equal(parseRoute('#/unknown').view,'home');
});
