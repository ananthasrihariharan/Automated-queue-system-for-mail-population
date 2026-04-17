const EventEmitter = require('events')

class QueueEventBus extends EventEmitter {}

// Global singleton
const eventBus = new QueueEventBus()

module.exports = eventBus
