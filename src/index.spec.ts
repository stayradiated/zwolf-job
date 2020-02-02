import * as db from '@zwolf/firestore'
import sinon from 'sinon'
import test from 'ava'
import { createMessage } from '@zwolf/turbine'

import { JobCollection } from './firestore'

import { monitorJob, AbortError } from './index'

test.beforeEach(async (t) => {
  const docs = await db.all(JobCollection)
  for (const doc of docs) {
    await db.remove(doc.ref)
  }
})

test('should monitor a successful job', async (t) => {
  const handler = monitorJob(async () => {
    return true
  })

  const message = createMessage({
    type: 'should.pass',
    payload: {
      hello: 'world',
    },
  })

  const dispatch = sinon.stub()

  await handler(message, dispatch)

  const jobs = await db.all(JobCollection)

  t.is(jobs.length, 1)
  t.is(jobs[0].ref.id, message.id)
  t.is(jobs[0].data.type, 'should.pass')
  t.true(jobs[0].data.requestedAt instanceof Date)
  t.is(jobs[0].data.failedAt, null)
  t.true(jobs[0].data.succeededAt instanceof Date)
})

test('should monitor a failed job', async (t) => {
  const handler = monitorJob(async () => {
    throw new Error('fail')
  })

  const message = createMessage({
    type: 'should.fail',
    payload: {
      hello: 'world',
    },
  })

  const dispatch = sinon.stub()

  await t.throwsAsync(handler(message, dispatch))

  const jobs = await db.all(JobCollection)

  t.is(jobs.length, 1)
  t.is(jobs[0].ref.id, message.id)
  t.is(jobs[0].data.type, 'should.fail')
  t.true(jobs[0].data.requestedAt instanceof Date)
  t.true(jobs[0].data.failedAt instanceof Date)
  t.is(jobs[0].data.succeededAt, null)
})

test('should monitor an aborted job', async (t) => {
  const handler = monitorJob(async () => {
    throw new AbortError('abort')
  })

  const message = createMessage({
    type: 'should.abort',
    payload: {
      hello: 'world',
    },
  })

  const dispatch = sinon.stub()

  // should not throw
  await handler(message, dispatch)

  const jobs = await db.all(JobCollection)

  t.is(jobs.length, 1)
  t.is(jobs[0].ref.id, message.id)
  t.is(jobs[0].data.type, 'should.abort')
  t.true(jobs[0].data.requestedAt instanceof Date)
  t.true(jobs[0].data.failedAt instanceof Date)
  t.is(jobs[0].data.succeededAt, null)
})
