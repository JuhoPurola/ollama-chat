import { EC2Client, DescribeInstancesCommand, StartInstancesCommand, StopInstancesCommand } from '@aws-sdk/client-ec2';

const INSTANCE_ID = process.env.INSTANCE_ID || 'i-0cb9859cf76e12243';
const REGION = 'eu-west-1';

const client = new EC2Client({ region: REGION });

let ollamaUrlCache: { url: string; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getInstanceStatus(): Promise<{ state: string; publicIp?: string }> {
  const result = await client.send(
    new DescribeInstancesCommand({
      InstanceIds: [INSTANCE_ID],
    })
  );

  const instance = result.Reservations?.[0]?.Instances?.[0];
  if (!instance) {
    throw new Error('Instance not found');
  }

  return {
    state: instance.State?.Name || 'unknown',
    publicIp: instance.PublicIpAddress,
  };
}

export async function startInstance(): Promise<void> {
  await client.send(
    new StartInstancesCommand({
      InstanceIds: [INSTANCE_ID],
    })
  );
  
  // Clear cache when starting instance
  ollamaUrlCache = null;
}

export async function stopInstance(): Promise<void> {
  await client.send(
    new StopInstancesCommand({
      InstanceIds: [INSTANCE_ID],
    })
  );
  
  // Clear cache when stopping instance
  ollamaUrlCache = null;
}

export async function getOllamaUrl(): Promise<string> {
  const now = Date.now();
  
  // Return cached URL if valid
  if (ollamaUrlCache && now - ollamaUrlCache.timestamp < CACHE_DURATION) {
    return ollamaUrlCache.url;
  }
  
  const status = await getInstanceStatus();
  if (!status.publicIp) {
    throw new Error('Instance has no public IP');
  }
  
  const url = `http://${status.publicIp}:11434`;
  
  // Update cache
  ollamaUrlCache = { url, timestamp: now };
  
  return url;
}

export async function checkOllamaReady(): Promise<boolean> {
  try {
    const url = await getOllamaUrl();
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}
