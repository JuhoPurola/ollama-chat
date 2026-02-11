interface Config {
  apiUrls: {
    chat: string;
    conversations: string;
    models: string;
    instance: string;
    costs: string;
    admin: string;
  };
  auth0: {
    domain: string;
    clientId: string;
    audience: string;
  };
}

export function getConfig(): Config {
  return (window as any).__CONFIG__;
}
