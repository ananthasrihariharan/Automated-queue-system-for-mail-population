const CustomerPreferenceRepository = require('./postgres/PgCustomerPreferenceRepository');
const CustomerRepository           = require('./postgres/PgCustomerRepository');
const IngestionTaskRepository      = require('./postgres/PgIngestionTaskRepository');
const JobCardRepository            = require('./postgres/PgJobCardRepository');
const JobEventRepository           = require('./postgres/PgJobEventRepository');
const JobRepository                = require('./postgres/PgJobRepository');
const QueueJobRepository           = require('./postgres/PgQueueJobRepository');
const QueueMessageRepository       = require('./postgres/PgQueueMessageRepository');
const QueueRequestRepository       = require('./postgres/PgQueueRequestRepository');
const QueueSessionRepository       = require('./postgres/PgQueueSessionRepository');
const QueueStatsRepository         = require('./postgres/PgQueueStatsRepository');
const QueueUnreadRepository        = require('./postgres/PgQueueUnreadRepository');
const SystemConfigRepository       = require('./postgres/PgSystemConfigRepository');
const UserRepository               = require('./postgres/PgUserRepository');
const WalkinRequestRepository      = require('./postgres/PgWalkinRequestRepository');
const LaminationProductRepository  = require('./postgres/PgLaminationProductRepository');
const BoardRepository              = require('./postgres/PgBoardRepository');
const MachineRepository            = require('./postgres/PgMachineRepository');

module.exports = {
  CustomerPreferenceRepository,
  CustomerRepository,
  IngestionTaskRepository,
  JobCardRepository,
  JobEventRepository,
  JobRepository,
  QueueJobRepository,
  QueueMessageRepository,
  QueueRequestRepository,
  QueueSessionRepository,
  QueueStatsRepository,
  QueueUnreadRepository,
  SystemConfigRepository,
  UserRepository,
  WalkinRequestRepository,
  LaminationProductRepository,
  BoardRepository,
  MachineRepository,

  // Aliases used throughout modules
  CustomerPreference:    CustomerPreferenceRepository,
  customerPreferenceRepo: CustomerPreferenceRepository,
  Customer:              CustomerRepository,
  customerRepo:          CustomerRepository,
  IngestionTask:         IngestionTaskRepository,
  ingestionTaskRepo:     IngestionTaskRepository,
  JobCard:               JobCardRepository,
  jobCardRepo:           JobCardRepository,
  JobEvent:              JobEventRepository,
  jobEventRepo:          JobEventRepository,
  Job:                   JobRepository,
  jobRepo:               JobRepository,
  QueueJob:              QueueJobRepository,
  queueJobRepo:          QueueJobRepository,
  QueueMessage:          QueueMessageRepository,
  queueMessageRepo:      QueueMessageRepository,
  QueueRequest:          QueueRequestRepository,
  queueRequestRepo:      QueueRequestRepository,
  QueueSession:          QueueSessionRepository,
  queueSessionRepo:      QueueSessionRepository,
  QueueStats:            QueueStatsRepository,
  queueStatsRepo:        QueueStatsRepository,
  QueueUnread:           QueueUnreadRepository,
  queueUnreadRepo:       QueueUnreadRepository,
  SystemConfig:          SystemConfigRepository,
  systemConfigRepo:      SystemConfigRepository,
  User:                  UserRepository,
  userRepo:              UserRepository,
  WalkinRequest:         WalkinRequestRepository,
  walkinRequestRepo:     WalkinRequestRepository,
  LaminationProduct:     LaminationProductRepository,
  laminationProductRepo: LaminationProductRepository,
  Board:                 BoardRepository,
  boardRepo:             BoardRepository,
  Machine:               MachineRepository,
  machineRepo:           MachineRepository,
};
