import { collection, Ref } from '@zwolf/firestore'

export interface Job {
  type: string,
  payload: Record<string, any>,
  requestedAt: Date,
  failedAt: Date,
  succeededAt: Date,
}

const JobCollection = collection<Job>('zwolf_job')

export { JobCollection }
