# @zwolf/job

> Keep track of pending/failed jobs


```typescript
import { jobMiddleware, createEventStore } from '@zwolf/job'

type Payload = {
  userId: string
}

const paymentStore = createEventStore<Payload>((payload) => {
  const { userId } = payload
  return `payment-store-${userId}`
})

const handlePayment = jobMiddleware(paymentStore)((message, dispatch) => {
  const { fromAccountId, toAccountId, amount } = message.payload
  await makePayment({ fromAccountId, toAccountId, amount })
})

const event = await paymentStore.get({ userId: 'george' })
await dispatchOnNextSuccess(event.id, {
  type: 'notify-user',
  payload: {
    userId: 'george',
    message: 'Payment was successful'
  }
})
```
