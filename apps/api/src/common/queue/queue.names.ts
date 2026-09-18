export const QueueNames = {
  notifications: 'intra.notifications',
  exports: 'intra.exports',
  files: 'intra.files',
  outboxRelay: 'intra.outbox-relay',
  followUpEngine: 'intra.follow-ups.engine',
  quotationFollowUpEngine: 'intra.quotations.engine',
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];
