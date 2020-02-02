import * as db from '@zwolf/firestore'
import { HandlerFn } from '@zwolf/turbine'
import { inspect } from 'util'

import { Job, JobCollection } from './firestore'

class AbortError extends Error {}

const monitorJob = (handlerFn: HandlerFn): HandlerFn => {
  return async (message, dispatch) => {
    const job = await db.set(JobCollection, message.id, {
      type: message.type,
      payload: message.payload,
      requestedAt: new Date(message.sentAt),
      failedAt: null,
      succeededAt: null,
    })

    try {
      const result = await handlerFn(message, dispatch)

      await db.update(job.ref, {
        succeededAt: db.value('serverDate'),
      })

      return result
    } catch (error) {
      await db.update(job.ref, {
        failedAt: db.value('serverDate'),
      })

      if (error instanceof AbortError) {
        console.error(error)
        // format error and remove stack trace
        return inspect(error).match(/^.*/)[0]
      }

      throw error
    }
  }
}

export { monitorJob, AbortError, Job, JobCollection }
