export interface ReusablePlaidBankConnectionRow {
  id: string;
  asset_id: string;
  provider: string;
  access_token: string;
  account_id: string;
  account_name: string;
  account_type: string | null;
  account_subtype: string | null;
  institution_name: string | null;
  institution_id: string | null;
  last_four: string | null;
  provider_item_id: string | null;
  status: string;
}

export interface LinkablePlaidBankConnectionOption {
  sourceConnectionId: string;
  accountName: string;
  accountType: string | null;
  accountSubtype: string | null;
  institutionName: string | null;
  institutionId: string | null;
  lastFour: string | null;
  providerItemId: string | null;
  linkedPropertyCount: number;
}

export function getReusablePlaidConnectionKey(
  connection: Pick<
    ReusablePlaidBankConnectionRow,
    "access_token" | "account_id" | "provider_item_id"
  >
): string {
  const itemKey = connection.provider_item_id || connection.access_token;

  return `${itemKey}:${connection.account_id}`;
}

export function getLinkablePlaidBankConnectionOptions({
  connections,
  targetAssetId
}: {
  connections: ReusablePlaidBankConnectionRow[];
  targetAssetId: string;
}): LinkablePlaidBankConnectionOption[] {
  const targetConnectionKeys = new Set(
    connections
      .filter((connection) => connection.asset_id === targetAssetId)
      .filter((connection) => connection.provider === "plaid")
      .map(getReusablePlaidConnectionKey)
  );
  const optionsByConnectionKey = new Map<
    string,
    {
      option: Omit<LinkablePlaidBankConnectionOption, "linkedPropertyCount">;
      linkedAssetIds: Set<string>;
    }
  >();

  connections
    .filter((connection) => connection.asset_id !== targetAssetId)
    .filter((connection) => connection.provider === "plaid")
    .filter((connection) => connection.status === "active")
    .forEach((connection) => {
      const connectionKey = getReusablePlaidConnectionKey(connection);

      if (targetConnectionKeys.has(connectionKey)) {
        return;
      }

      const existingOption = optionsByConnectionKey.get(connectionKey);

      if (existingOption) {
        existingOption.linkedAssetIds.add(connection.asset_id);
        return;
      }

      optionsByConnectionKey.set(connectionKey, {
        linkedAssetIds: new Set([connection.asset_id]),
        option: {
          sourceConnectionId: connection.id,
          accountName: connection.account_name,
          accountType: connection.account_type,
          accountSubtype: connection.account_subtype,
          institutionName: connection.institution_name,
          institutionId: connection.institution_id,
          lastFour: connection.last_four,
          providerItemId: connection.provider_item_id
        }
      });
    });

  return Array.from(optionsByConnectionKey.values())
    .map(({ linkedAssetIds, option }) => ({
      ...option,
      linkedPropertyCount: linkedAssetIds.size
    }))
    .sort((left, right) => {
      const leftLabel = `${left.institutionName ?? ""} ${left.accountName}`;
      const rightLabel = `${right.institutionName ?? ""} ${right.accountName}`;

      return leftLabel.localeCompare(rightLabel);
    });
}
