type Task = () => Promise<void>

export class SimpleQueue {
  private concurrency: number
  private running = 0
  private queue: Task[] = []

  constructor(concurrency = 2) {
    this.concurrency = concurrency
  }

  add(task: Task): void {
    this.queue.push(task)
    this.drain()
  }

  clear(): void {
    this.queue = []
  }

  private drain(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()!
      this.running++
      task().finally(() => {
        this.running--
        this.drain()
      })
    }
  }
}
