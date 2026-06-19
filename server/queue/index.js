import { Queue } from 'bullmq'
import { createRedisConnection } from './worker.js'
import config from '../config/index.js'

const connection = createRedisConnection()

export const queue = new Queue('prbot-jobs', { connection })

export async function addJob(data) {
  return queue.add('process-pr', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
  })
}
