Phase 20 — Repository Factory & Database Switching Architecture Implementation Plan

Implement Phase 20 of the PostgreSQL migration project.

All database migrations (Phase 1–19) are complete and fully validated.

MongoDB remains the current production database.

PostgreSQL is a fully replicated shadow database.

This phase does NOT perform any new data migration.

This phase refactors the application architecture so the backend can switch between MongoDB and PostgreSQL dynamically using a configuration variable.

Production logic and API behavior must remain unchanged.

No BaseRepository pattern.

No generic CRUD abstraction.

No schema modifications.

No data writes or migration scripts in this phase.


Primary Objective

Make the entire application database-independent.

Controllers and services must no longer directly use Mongoose models.

Instead, all data access must flow through a repository factory.

The application must support:

DB_MODE=mongo

or

DB_MODE=postgres

without changing controller or service code.



Architecture Target


Current architecture:

Routes
  ↓
Controllers
  ↓
Direct Mongoose Models

Example:

authController.js
   ↓
User.findOne()

queueController.js
   ↓
QueueJob.find()


Target architecture:

Routes
  ↓
Controllers
  ↓
Services (if any)
  ↓
Repository Factory
        ↓
   ┌──────────────┐
   │              │
Mongo Repository  Postgres Repository


Controllers must not know which database is active.



Environment Variable

Add support for:

.env

DB_MODE=mongo


Allowed values:

mongo
postgres


If missing:

default = mongo



Repository Factory

Create:

repositories/index.js


Purpose:

Central database switcher.


Implementation:

const DB_MODE = process.env.DB_MODE || 'mongo'

module.exports = {

  UserRepository:

      DB_MODE === 'postgres'

      ? require('./postgres/PgUserRepository')

      : require('./mongo/MongoUserRepository'),

  CustomerRepository:

      DB_MODE === 'postgres'

      ? require('./postgres/PgCustomerRepository')

      : require('./mongo/MongoCustomerRepository'),

  QueueJobRepository:

      DB_MODE === 'postgres'

      ? require('./postgres/PgQueueJobRepository')

      : require('./mongo/MongoQueueJobRepository'),

  JobRepository:

      DB_MODE === 'postgres'

      ? require('./postgres/PgJobRepository')

      : require('./mongo/MongoJobRepository'),

  QueueSessionRepository:

      DB_MODE === 'postgres'

      ? require('./postgres/PgQueueSessionRepository')

      : require('./mongo/MongoQueueSessionRepository'),

  QueueRequestRepository:

      DB_MODE === 'postgres'

      ? require('./postgres/PgQueueRequestRepository')

      : require('./mongo/MongoQueueRequestRepository'),

  QueueUnreadRepository:

      DB_MODE === 'postgres'

      ? require('./postgres/PgQueueUnreadRepository')

      : require('./mongo/MongoQueueUnreadRepository'),

  QueueMessageRepository:

      DB_MODE === 'postgres'

      ? require('./postgres/PgQueueMessageRepository')

      : require('./mongo/MongoQueueMessageRepository'),

  JobEventRepository:

      DB_MODE === 'postgres'

      ? require('./postgres/PgJobEventRepository')

      : require('./mongo/MongoJobEventRepository'),

  ParcelRepository:

      DB_MODE === 'postgres'

      ? require('./postgres/PgParcelRepository')

      : require('./mongo/MongoParcelRepository')

}



Mongo Repository Layer

Create:

repositories/mongo/


Create wrapper repositories for every active Mongo model.


Example:

repositories/mongo/MongoUserRepository.js


Do NOT directly use Mongoose models in controllers anymore.


Example:

const User = require('../../models/User')

module.exports = {

  async getById(id) {
    return await User.findById(id)
  },

  async getByEmail(email) {
    return await User.findOne({ email })
  },

  async createUser(data) {
    return await User.create(data)
  }

}


Repeat for all major models currently used by controllers.



Controller Refactor

Find all controllers/services directly importing models.


Example current code:

const User = require('../models/User')

const user = await User.findOne({
  email: req.body.email
})


Replace with:

const { UserRepository } =
    require('../repositories')

const user =
    await UserRepository.getByEmail(
      req.body.email
    )


Controllers must never import:

models/User

models/QueueJob

models/Customer

models/Job

models/Parcel

or any direct Mongoose model


Only repositories allowed.



Method Compatibility Requirement

Mongo repositories and PostgreSQL repositories must expose identical method names.

Example:


User

getById(id)

getByEmail(email)

createUser(data)

updateUser(id,data)

deleteUser(id)


Customer

getCustomerByPhone(phone)

createCustomer(data)

updateCustomer(id,data)


QueueJob

getById(id)

createJob(data)

updateStatus(id,status)

getByStatus(status)


Job

getById(id)

getByCustomer(customerId)

updateJobStatus(id,status)


If a PostgreSQL repository method exists:

Mongo repository must expose the same method signature.



Validation Script

Create:

scripts/validateRepositoryFactory.js


Purpose:

Verify switching works correctly.


Tests:

Set:

DB_MODE=mongo

Load repository factory

Verify:

UserRepository points to Mongo repository

CustomerRepository points to Mongo repository


Then:

Set:

DB_MODE=postgres

Reload repository factory

Verify:

UserRepository points to PostgreSQL repository

CustomerRepository points to PostgreSQL repository


Example:

[OK] Mongo mode repository switching passed

[OK] Postgres mode repository switching passed



Safety Rules

Do NOT modify MongoDB production models

Do NOT modify PostgreSQL schema

Do NOT remove legacy migration fields

Do NOT change business logic

Do NOT change API response structure

Do NOT break existing routes

Do NOT rewrite service logic


This phase is architecture refactoring only.



Verification Plan

Run:

node scripts/validateRepositoryFactory.js


Test boot application:

DB_MODE=mongo

node server.js


Verify normal application behavior.


Then test:

DB_MODE=postgres

node server.js


Verify application boots successfully.


Expected Final State


Application can switch databases dynamically.


Example:


.env

DB_MODE=mongo


Application uses MongoDB.


.env

DB_MODE=postgres


Application uses PostgreSQL.


No controller changes required.


Next phase:

Phase 21 — Read Path Cutover


Where read operations (GET APIs) begin using PostgreSQL while writes remain on MongoDB.