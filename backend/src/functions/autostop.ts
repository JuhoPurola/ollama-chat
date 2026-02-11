import { EC2Client, DescribeInstancesCommand, StopInstancesCommand } from '@aws-sdk/client-ec2';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const INSTANCE_ID = process.env.INSTANCE_ID || 'i-0cb9859cf76e12243';
const TABLE_NAME = process.env.TABLE_NAME!;
const REGION = 'eu-west-1';
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const HARD_LIMIT_MS = 60 * 60 * 1000; // 1 hour

const ec2 = new EC2Client({ region: REGION });
const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async () => {
  try {
    // Check instance state
    const desc = await ec2.send(
      new DescribeInstancesCommand({ InstanceIds: [INSTANCE_ID] })
    );
    const instance = desc.Reservations?.[0]?.Instances?.[0];
    if (!instance || instance.State?.Name !== 'running') {
      console.log(`Instance is ${instance?.State?.Name || 'unknown'}, nothing to do`);
      return;
    }

    const now = Date.now();

    // Check hard limit: instance launch time
    const launchTime = instance.LaunchTime?.getTime();
    if (launchTime && now - launchTime > HARD_LIMIT_MS) {
      console.log(`Instance running for ${Math.round((now - launchTime) / 60000)} min, exceeds 1h hard limit. Stopping.`);
      await ec2.send(new StopInstancesCommand({ InstanceIds: [INSTANCE_ID] }));
      return;
    }

    // Check UI activity heartbeat
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
          ':pk': 'SYSTEM',
          ':sk': 'HEARTBEAT',
        },
      })
    );

    const heartbeat = result.Items?.[0]?.timestamp;
    if (!heartbeat) {
      console.log('No heartbeat found. Stopping idle instance.');
      await ec2.send(new StopInstancesCommand({ InstanceIds: [INSTANCE_ID] }));
      return;
    }

    const lastActivity = new Date(heartbeat).getTime();
    const idleMs = now - lastActivity;

    if (idleMs > IDLE_TIMEOUT_MS) {
      console.log(`No UI activity for ${Math.round(idleMs / 60000)} min. Stopping.`);
      await ec2.send(new StopInstancesCommand({ InstanceIds: [INSTANCE_ID] }));
      return;
    }

    console.log(`Instance active. Last heartbeat ${Math.round(idleMs / 1000)}s ago, uptime ${Math.round((now - launchTime!) / 60000)} min.`);
  } catch (error) {
    console.error('Autostop error:', error);
  }
};
