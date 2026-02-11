import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { getAuthUser } from '../lib/auth.js';

const client = new CostExplorerClient({ region: 'us-east-1' });

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    // Verify authentication
    await getAuthUser(event);

    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const endOfYesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const formatDate = (date: Date): string => {
      return date.toISOString().split('T')[0];
    };

    // Get yesterday's costs
    const yesterdayResult = await client.send(
      new GetCostAndUsageCommand({
        TimePeriod: {
          Start: formatDate(yesterday),
          End: formatDate(endOfYesterday),
        },
        Granularity: 'DAILY',
        Metrics: ['UnblendedCost'],
        Filter: {
          Dimensions: {
            Key: 'SERVICE',
            Values: ['Amazon Elastic Compute Cloud - Compute'],
          },
        },
      })
    );

    // Get this month's costs
    const monthResult = await client.send(
      new GetCostAndUsageCommand({
        TimePeriod: {
          Start: formatDate(startOfMonth),
          End: formatDate(endOfYesterday),
        },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        Filter: {
          Dimensions: {
            Key: 'SERVICE',
            Values: ['Amazon Elastic Compute Cloud - Compute'],
          },
        },
      })
    );

    const yesterdayCost =
      yesterdayResult.ResultsByTime?.[0]?.Total?.UnblendedCost?.Amount || '0';
    const monthCost =
      monthResult.ResultsByTime?.[0]?.Total?.UnblendedCost?.Amount || '0';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yesterday: parseFloat(parseFloat(yesterdayCost).toFixed(2)),
        month: parseFloat(parseFloat(monthCost).toFixed(2)),
      }),
    };
  } catch (error) {
    console.error('Costs error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
