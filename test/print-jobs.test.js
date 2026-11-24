const test = require('node:test');
const assert = require('node:assert');
const { createPrintJobs } = require('../print-jobs');

test('print-jobs: ocupado durante a impressão e no respiro depois dela', () => {
  let t = 0;
  const jobs = createPrintJobs({ graceMs: 5000, staleMs: 60000, now: () => t });
  assert.strictEqual(jobs.isBusy(), false);
  const finish = jobs.begin();
  assert.strictEqual(jobs.isBusy(), true);
  t = 1000;
  finish();
  finish(); // idempotente
  assert.strictEqual(jobs.isBusy(), true);
  t = 6001;
  assert.strictEqual(jobs.isBusy(), false);
});

test('print-jobs: impressão travada não bloqueia o update para sempre', () => {
  let t = 0;
  const jobs = createPrintJobs({ graceMs: 5000, staleMs: 60000, now: () => t });
  jobs.begin();
  t = 59000;
  assert.strictEqual(jobs.isBusy(), true);
  t = 60001;
  assert.strictEqual(jobs.isBusy(), false);
});
