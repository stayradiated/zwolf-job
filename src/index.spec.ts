import * as db from '@zwolf/firestore'
import anyTest, { TestInterface } from 'ava'
import sinon from 'sinon'
import uuid from 'uuid'
import { createMessage } from '@zwolf/turbine'

import {
  EventStore,
  EventStatusCollection,
  EventHookCollection,
  createEventStore,
  jobMiddleware,
  dispatchOnNextSuccess,
} from './index'

type Payload = { userId: string }

const test = anyTest as TestInterface<{
  userId: string,
  eventId: string,
  store: EventStore<Payload>,
}>

test.beforeEach((t) => {
  const buildId = (payload: Payload) => `test-${payload.userId}`

  const userId = uuid()
  const eventId = buildId({ userId })

  const store = createEventStore<Payload>(buildId)

  t.context = {
    userId,
    eventId,
    store,
  }
})

test('createEventStore: should create an event store', (t) => {
  const { store } = t.context
  t.truthy(store.buildId)
  t.truthy(store.get)
})

test('createEventStore: store.buildId should call parent', (t) => {
  const { userId, eventId, store } = t.context

  t.is(store.buildId({ userId }), eventId)
})

test('createEventStore: store.get should get an empty event', async (t) => {
  const { userId, eventId, store } = t.context

  const event = await store.get({ userId })

  t.deepEqual(event, {
    id: eventId,
    createdAt: undefined,
    updatedAt: undefined,
    lastSuccessAt: undefined,
    lastFailureAt: undefined,
    lastRequestAt: undefined,
  })
})

test('createEventStore: store.get should get an successful event', async (t) => {
  const { userId, eventId, store } = t.context

  await db.set(EventStatusCollection, eventId, {
    createdAt: db.value('serverDate'),
    updatedAt: db.value('serverDate'),
    lastRequestAt: db.value('serverDate'),
    lastFailureAt: null,
    lastSuccessAt: db.value('serverDate'),
  })

  const status = await db.get(EventStatusCollection, eventId)

  const event = await store.get({ userId })

  t.deepEqual(event, {
    id: eventId,
    createdAt: status.data.createdAt,
    updatedAt: status.data.updatedAt,
    lastRequestAt: status.data.lastRequestAt,
    lastFailureAt: null,
    lastSuccessAt: status.data.lastSuccessAt,
  })
})

test('dispatchOnNextSuccess: should add a new hook', async (t) => {
  const { eventId, userId } = t.context

  const messageTemplate = {
    type: 'hook',
    payload: { userId },
  }

  await dispatchOnNextSuccess(eventId, messageTemplate)

  const hooks = await db.query(EventHookCollection, [
    db.where(['messageTemplate', 'payload', 'userId'], '==', userId),
  ])

  t.is(hooks.length, 1)
  const hook = hooks[0]

  t.is(hook.data.eventStatusId, eventId)
  t.is(hook.data.onState, 'SUCCESS')
  t.deepEqual(hook.data.messageTemplate, messageTemplate)
})

test('jobMiddleware: should wrap a successful handler', async (t) => {
  const { userId, eventId, store } = t.context

  await dispatchOnNextSuccess(eventId, {
    type: 'success',
    payload: { userId },
  })

  const handler = jobMiddleware(store)(async (message, dispatch) => {
    return 'success'
  })

  const message = createMessage({
    type: 'test',
    payload: { userId },
  })

  const dispatch = sinon.stub()

  await handler(message, dispatch)

  const status = await store.get({ userId })
  t.truthy(status.lastSuccessAt)
  t.falsy(status.lastFailureAt)
  t.truthy(status.lastRequestAt)

  t.is(dispatch.callCount, 1)
  t.deepEqual(dispatch.args, [
    [
      {
        type: 'success',
        payload: { userId },
      },
    ],
  ])
})

test('jobMiddleware: should wrap a failing handler', async (t) => {
  const { userId, eventId, store } = t.context

  await dispatchOnNextSuccess(eventId, {
    type: 'success',
    payload: { userId },
  })

  const handler = jobMiddleware(store)(async (message, dispatch) => {
    throw new Error('error')
  })

  const message = createMessage({
    type: 'test',
    payload: { userId },
  })

  const dispatch = sinon.stub()

  await t.throwsAsync(handler(message, dispatch))

  const status = await store.get({ userId })
  t.truthy(status.lastRequestAt)
  t.truthy(status.lastFailureAt)
  t.falsy(status.lastSuccessAt)

  t.is(dispatch.callCount, 0)
})
