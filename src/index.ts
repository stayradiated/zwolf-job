import * as db from '@zwolf/firestore'
import { HandlerFn, MessageTemplate } from '@zwolf/turbine'

export interface EventStatus {
  id: string,
  createdAt: Date,
  updatedAt: Date,

  lastRequestAt: Date,
  lastFailureAt: Date,
  lastSuccessAt: Date,
}

export interface EventHook {
  eventStatusId: string,
  createdAt: Date,
  onState: string,
  messageTemplate: MessageTemplate,
}

export interface EventHookMap {
  onSuccess: EventHook[],
}

export type IDBuilder<Payload> = (payload: Payload) => string

export interface EventStore<Payload> {
  buildId: IDBuilder<Payload>,
  get(payload: Payload): Promise<EventStatus>,
}

const EventStatusCollection = db.collection<Omit<EventStatus, 'id'>>(
  'zwolf_event_status',
)

const EventHookCollection = db.collection<EventHook>('zwolf_event_hook')

const getEventStatus = async (eventStatusId: string) => {
  const status = await db.get(EventStatusCollection, eventStatusId)

  const { updatedAt, createdAt, lastSuccessAt, lastFailureAt, lastRequestAt } =
    status?.data || ({} as any)

  return {
    id: eventStatusId,
    createdAt,
    updatedAt,
    lastSuccessAt,
    lastFailureAt,
    lastRequestAt,
  }
}

const getEventHooks = async (eventStatusId: string): Promise<EventHookMap> => {
  const hookList = await db.query(EventHookCollection, [
    db.where('eventStatusId', '==', eventStatusId),
  ])

  const hooks = hookList.reduce(
    (groups, hook) => {
      switch (hook.data.onState) {
        case 'SUCCESS':
          groups.onSuccess.push(hook.data)
          break
      }
      return groups
    },
    {
      onSuccess: [],
    },
  )

  return hooks
}

const dispatchOnNextState = (
  eventStatusId: string,
  onState: 'SUCCESS',
  messageTemplate: MessageTemplate,
) => {
  return db.add(EventHookCollection, {
    eventStatusId,
    createdAt: db.value('serverDate'),
    onState,
    messageTemplate,
  })
}

const dispatchOnNextSuccess = (
  eventStatusId: string,
  messageTemplate: MessageTemplate,
) => {
  return dispatchOnNextState(eventStatusId, 'SUCCESS', messageTemplate)
}

const createOrUpdateEventLastRequest = async (eventStatusId: string) => {
  const status = await db.get(EventStatusCollection, eventStatusId)
  if (status == null) {
    await db.set(EventStatusCollection, eventStatusId, {
      createdAt: db.value('serverDate'),
      updatedAt: db.value('serverDate'),
      lastRequestAt: db.value('serverDate'),
      lastSuccessAt: null,
      lastFailureAt: null,
    })
  } else {
    await db.update(EventStatusCollection, eventStatusId, {
      updatedAt: db.value('serverDate'),
      lastRequestAt: db.value('serverDate'),
    })
  }
}

const updateEventLastFailure = async (eventStatusId: string) => {
  await db.update(EventStatusCollection, eventStatusId, {
    updatedAt: db.value('serverDate'),
    lastFailureAt: db.value('serverDate'),
  })
}

const updateEventLastSuccess = async (eventStatusId: string) => {
  await db.update(EventStatusCollection, eventStatusId, {
    lastSuccessAt: db.value('serverDate'),
    updatedAt: db.value('serverDate'),
  })
}

const jobMiddleware = <Payload>(store: EventStore<Payload>) => (
  handler: HandlerFn,
): HandlerFn => {
  return async (message, dispatch) => {
    const eventStatusId = store.buildId(message.payload)

    await createOrUpdateEventLastRequest(eventStatusId)

    const hooks = await getEventHooks(eventStatusId)
    try {
      const result = await handler(message, dispatch)
      await updateEventLastSuccess(eventStatusId)

      for (const hook of hooks.onSuccess) {
        await dispatch(hook.messageTemplate)
      }

      return result
    } catch (error) {
      await updateEventLastFailure(eventStatusId)
      throw error
    }
  }
}

const createEventStore = <Payload>(
  buildId: IDBuilder<Payload>,
): EventStore<Payload> => {
  return {
    buildId,
    get: (payload: Payload) => {
      const eventStatusId = buildId(payload)
      return getEventStatus(eventStatusId)
    },
  }
}

export {
  EventStatusCollection,
  EventHookCollection,
  getEventStatus,
  dispatchOnNextSuccess,
  jobMiddleware,
  createEventStore,
  createOrUpdateEventLastRequest,
  updateEventLastFailure,
  updateEventLastSuccess,
}
