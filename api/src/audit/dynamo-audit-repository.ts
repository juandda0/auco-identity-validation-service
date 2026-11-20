import { randomUUID } from 'node:crypto';
import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  waitUntilTableExists,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  documentKeyOf,
  sortKeyOf,
  type AuditEvent,
  type AuditRepository,
  type NewAuditEvent,
} from './audit-event.js';

export const PHONE_INDEX = 'phone-index';

export function createDynamoAuditRepository(
  client: DynamoDBClient,
  tableName: string,
): AuditRepository {
  const doc = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });

  async function queryAll(input: QueryCommandInput): Promise<AuditEvent[]> {
    const items: AuditEvent[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await doc.send(new QueryCommand({ ...input, ExclusiveStartKey: startKey }));
      items.push(...((page.Items ?? []) as AuditEvent[]));
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return items;
  }

  return {
    async append(event: NewAuditEvent) {
      const { occurredAt: date, ...rest } = event;
      const eventId = randomUUID();
      const occurredAt = (date ?? new Date()).toISOString();
      const item: AuditEvent = {
        ...rest,
        documentKey: documentKeyOf(event.countryCode, event.documentNumber),
        sk: sortKeyOf(occurredAt, eventId),
        eventId,
        occurredAt,
      };
      // Append-only: the condition makes it impossible to overwrite an existing event.
      await doc.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(documentKey) AND attribute_not_exists(sk)',
        }),
      );
      return item;
    },

    async listByDocument(documentKey) {
      return queryAll({
        TableName: tableName,
        KeyConditionExpression: 'documentKey = :pk',
        ExpressionAttributeValues: { ':pk': documentKey },
        ScanIndexForward: true,
        // The risk engine must see the event written a moment ago. Strongly consistent
        // reads are available on the base table (GSIs are always eventually consistent).
        ConsistentRead: true,
      });
    },

    async listByPhone(phone) {
      return queryAll({
        TableName: tableName,
        IndexName: PHONE_INDEX,
        KeyConditionExpression: 'phone = :phone',
        ExpressionAttributeValues: { ':phone': phone },
        ScanIndexForward: true,
      });
    },
  };
}

/** Creates the table on startup if it does not exist (idempotent). */
export async function ensureAuditTable(client: DynamoDBClient, tableName: string): Promise<void> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return;
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
  }

  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'documentKey', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
        { AttributeName: 'phone', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'documentKey', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          // Sparse index: only events that carry a phone number are projected.
          IndexName: PHONE_INDEX,
          KeySchema: [
            { AttributeName: 'phone', KeyType: 'HASH' },
            { AttributeName: 'sk', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    }),
  );
  await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: tableName });
}
