"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useCallback,
  useEffect,
  useState,
  type FormEvent
} from "react";
import { useFormStatus } from "react-dom";
import {
  CircleAlert,
  CheckCircle2,
  Landmark,
  Link2,
  RefreshCw,
  Trash2
} from "lucide-react";

import {
  checkAndSyncPlaidBankConnections,
  completePlaidReconnect,
  connectPlaidBank,
  createPlaidLinkToken,
  createPlaidReconnectLinkToken,
  linkExistingPlaidBankConnection,
  listLinkablePlaidBankConnections,
  removeBankConnection,
  type LinkablePlaidBankConnectionsState,
  type RealEstateActionState
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RealEstateAssetDetail, RealEstateBankConnection } from "@/types/wealth";

import {
  PLAID_LINK_ASSET_ID_STORAGE_KEY,
  PLAID_LINK_CONNECTION_ID_STORAGE_KEY,
  PLAID_LINK_MODE_STORAGE_KEY,
  PLAID_LINK_TOKEN_STORAGE_KEY,
  type PlaidLinkMode
} from "./plaid-link-storage";
import type { PlaidLinkMetadata } from "./plaid-link-types";

const idleState: RealEstateActionState = {
  status: "idle",
  message: ""
};

const emptyLinkableConnectionsState: LinkablePlaidBankConnectionsState = {
  status: "idle",
  message: "",
  connections: []
};

function formatLastFour(lastFour: string | null): string {
  return lastFour ? `•••• ${lastFour}` : "Last 4 unavailable";
}

function formatConnectionTimestamp(value: string | null): string {
  if (!value) {
    return "Not synced yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatLinkedPropertyCount(count: number): string {
  return `${count} ${count === 1 ? "property" : "properties"}`;
}

function ConnectionStatusBadge({
  status
}: {
  status: RealEstateBankConnection["status"];
}) {
  const isActive = status === "active";
  const Icon = isActive ? CheckCircle2 : CircleAlert;

  return (
    <span
      className={cn(
        "inline-flex h-7 w-fit items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold shadow-sm ring-1 ring-inset",
        isActive
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 ring-emerald-100 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-300 dark:ring-emerald-900/60"
          : "border-amber-200 bg-amber-50 text-amber-700 ring-amber-100 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-300 dark:ring-amber-900/60"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {isActive ? "Connected" : "Needs reconnect"}
    </span>
  );
}

function CheckAndSyncButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={disabled || pending} type="submit" variant="secondary">
      <RefreshCw className={cn("h-4 w-4", pending ? "animate-spin" : "")} />
      {pending ? "Checking" : "Check & Sync"}
    </Button>
  );
}

function CheckAndSyncForm({
  disabled,
  onResult,
  propertyId
}: {
  disabled: boolean;
  onResult: (state: RealEstateActionState) => void;
  propertyId: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    checkAndSyncPlaidBankConnections.bind(null, propertyId),
    idleState
  );

  useEffect(() => {
    onResult(state);

    if (state.status === "success") {
      router.refresh();
    }
  }, [onResult, router, state]);

  return (
    <form action={formAction} className="contents">
      <CheckAndSyncButton disabled={disabled} />
    </form>
  );
}

function getSelectedPlaidAccountIds(metadata: PlaidLinkMetadata): string[] {
  return (metadata.accounts ?? [])
    .map((account) => account.id ?? account.account_id ?? "")
    .filter(Boolean);
}

function clearPlaidOAuthState() {
  window.localStorage.removeItem(PLAID_LINK_ASSET_ID_STORAGE_KEY);
  window.localStorage.removeItem(PLAID_LINK_CONNECTION_ID_STORAGE_KEY);
  window.localStorage.removeItem(PLAID_LINK_MODE_STORAGE_KEY);
  window.localStorage.removeItem(PLAID_LINK_TOKEN_STORAGE_KEY);
}

function storePlaidOAuthState({
  assetId,
  connectionId,
  linkToken,
  mode
}: {
  assetId: string;
  connectionId?: string;
  linkToken: string;
  mode: PlaidLinkMode;
}) {
  window.localStorage.setItem(PLAID_LINK_ASSET_ID_STORAGE_KEY, assetId);
  window.localStorage.setItem(PLAID_LINK_MODE_STORAGE_KEY, mode);
  window.localStorage.setItem(PLAID_LINK_TOKEN_STORAGE_KEY, linkToken);

  if (connectionId) {
    window.localStorage.setItem(PLAID_LINK_CONNECTION_ID_STORAGE_KEY, connectionId);
  } else {
    window.localStorage.removeItem(PLAID_LINK_CONNECTION_ID_STORAGE_KEY);
  }
}

function RemoveConnectionButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      className="w-fit text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
      disabled={pending}
      size="sm"
      type="submit"
      variant="ghost"
    >
      <Trash2 className="h-4 w-4" />
      {pending ? "Removing" : "Remove"}
    </Button>
  );
}

function RemoveConnectionForm({
  connection,
  propertyId
}: {
  connection: RealEstateBankConnection;
  propertyId: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    removeBankConnection.bind(null, propertyId),
    idleState
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      `Remove ${connection.accountName}? This account will stop being used for rent and expense transaction matching.`
    );

    if (!confirmed) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} className="grid gap-1" onSubmit={handleSubmit}>
      <input name="connectionId" type="hidden" value={connection.id} />
      <RemoveConnectionButton />
      {state.message ? (
        <p
          className={cn(
            "text-xs font-semibold",
            state.status === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
          )}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function PlaidConnectionManager({
  property
}: {
  property: RealEstateAssetDetail;
}) {
  const router = useRouter();
  const [isScriptReady, setIsScriptReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [reconnectingConnectionId, setReconnectingConnectionId] = useState<string | null>(
    null
  );
  const [isExistingAccountPanelOpen, setIsExistingAccountPanelOpen] = useState(false);
  const [isLoadingExistingAccounts, setIsLoadingExistingAccounts] = useState(false);
  const [linkingExistingConnectionId, setLinkingExistingConnectionId] = useState<
    string | null
  >(null);
  const [existingAccountState, setExistingAccountState] =
    useState<LinkablePlaidBankConnectionsState>(emptyLinkableConnectionsState);
  const [syncState, setSyncState] = useState<RealEstateActionState>(idleState);
  const [state, setState] = useState<RealEstateActionState>(idleState);
  const connectedAccounts = property.bankConnections;
  const isConnected = connectedAccounts.length > 0;
  const disconnectedAccountCount = connectedAccounts.filter(
    (connection) => connection.status !== "active"
  ).length;
  const hasDisconnectedAccounts = disconnectedAccountCount > 0;
  const isBankActionPending =
    isConnecting || isLoadingExistingAccounts || Boolean(linkingExistingConnectionId);
  const isDisabled = !isScriptReady || isBankActionPending;

  useEffect(() => {
    if (window.Plaid) {
      setIsScriptReady(true);
    }
  }, []);

  const handleSyncResult = useCallback((result: RealEstateActionState) => {
    setSyncState(result);
  }, []);

  async function openExistingAccountPanel() {
    if (isExistingAccountPanelOpen) {
      setIsExistingAccountPanelOpen(false);
      return;
    }

    setIsExistingAccountPanelOpen(true);
    setIsLoadingExistingAccounts(true);
    setExistingAccountState(emptyLinkableConnectionsState);
    setState(idleState);

    try {
      const result = await listLinkablePlaidBankConnections(property.id);

      setExistingAccountState(result);
    } catch (error) {
      setExistingAccountState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Could not load existing bank accounts.",
        connections: []
      });
    } finally {
      setIsLoadingExistingAccounts(false);
    }
  }

  async function linkExistingAccount(sourceConnectionId: string) {
    setLinkingExistingConnectionId(sourceConnectionId);
    setState({
      status: "idle",
      message: "Linking existing bank account..."
    });

    try {
      const result = await linkExistingPlaidBankConnection(property.id, sourceConnectionId);

      setState(result);

      if (result.status === "success") {
        setIsExistingAccountPanelOpen(false);
        setExistingAccountState(emptyLinkableConnectionsState);
        router.refresh();
      }
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Could not link existing bank account."
      });
    } finally {
      setLinkingExistingConnectionId(null);
    }
  }

  async function openPlaidLink() {
    if (!window.Plaid) {
      setState({
        status: "error",
        message: "Plaid Link is still loading."
      });
      return;
    }

    setIsConnecting(true);
    setReconnectingConnectionId(null);
    setState({
      status: "idle",
      message: "Opening Plaid Link..."
    });

    try {
      const tokenResult = await createPlaidLinkToken(property.id);

      if (tokenResult.status === "error" || !tokenResult.linkToken) {
        setState({
          status: "error",
          message: tokenResult.message || "Could not create Plaid Link token."
        });
        setIsConnecting(false);
        return;
      }

      storePlaidOAuthState({
        assetId: property.id,
        linkToken: tokenResult.linkToken,
        mode: "connect"
      });
      const plaidLink = window.Plaid.create({
        token: tokenResult.linkToken,
        onSuccess: (publicToken, metadata) => {
          if (!publicToken) {
            setIsConnecting(false);
            setState({
              status: "error",
              message: "Plaid public token is missing."
            });
            return;
          }

          setState({
            status: "idle",
            message: "Saving bank connection..."
          });

          void connectPlaidBank(
            property.id,
            publicToken,
            getSelectedPlaidAccountIds(metadata)
          )
            .then((result) => {
              setState(result);

              if (result.status === "success") {
                clearPlaidOAuthState();
                router.refresh();
              }
            })
            .finally(() => {
              setIsConnecting(false);
            });
        },
        onExit: (error) => {
          setIsConnecting(false);
          clearPlaidOAuthState();

          if (!error) {
            setState(idleState);
            return;
          }

          setState({
            status: "error",
            message:
              error.display_message ||
              error.error_message ||
              "Plaid Link could not finish."
          });
        }
      });

      plaidLink.open();
    } catch (error) {
      setIsConnecting(false);
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not open Plaid Link."
      });
    }
  }

  async function openPlaidReconnect(connection: RealEstateBankConnection) {
    if (!window.Plaid) {
      setState({
        status: "error",
        message: "Plaid Link is still loading."
      });
      return;
    }

    setIsConnecting(true);
    setReconnectingConnectionId(connection.id);
    setState({
      status: "idle",
      message: `Opening reconnect for ${connection.accountName}...`
    });

    try {
      const tokenResult = await createPlaidReconnectLinkToken(property.id, connection.id);

      if (tokenResult.status === "error" || !tokenResult.linkToken) {
        setState({
          status: "error",
          message: tokenResult.message || "Could not create Plaid reconnect token."
        });
        setIsConnecting(false);
        setReconnectingConnectionId(null);
        return;
      }

      storePlaidOAuthState({
        assetId: property.id,
        connectionId: connection.id,
        linkToken: tokenResult.linkToken,
        mode: "update"
      });
      const plaidLink = window.Plaid.create({
        token: tokenResult.linkToken,
        onSuccess: () => {
          setState({
            status: "idle",
            message: "Saving reconnected account..."
          });

          void completePlaidReconnect(property.id, connection.id)
            .then((result) => {
              setState(result);

              if (result.status === "success") {
                clearPlaidOAuthState();
                router.refresh();
              }
            })
            .finally(() => {
              setIsConnecting(false);
              setReconnectingConnectionId(null);
            });
        },
        onExit: (error) => {
          setIsConnecting(false);
          setReconnectingConnectionId(null);
          clearPlaidOAuthState();

          if (!error) {
            setState(idleState);
            return;
          }

          setState({
            status: "error",
            message:
              error.display_message ||
              error.error_message ||
              "Plaid reconnect could not finish."
          });
        }
      });

      plaidLink.open();
    } catch (error) {
      setIsConnecting(false);
      setReconnectingConnectionId(null);
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Could not open Plaid reconnect."
      });
    }
  }

  return (
    <div className="grid gap-4">
      <Script
        onError={() => {
          setIsScriptReady(false);
          setState({
            status: "error",
            message: "Plaid Link could not load. Check your browser or network settings."
          });
        }}
        onReady={() => {
          setIsScriptReady(true);
        }}
        src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
        strategy="afterInteractive"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {hasDisconnectedAccounts
              ? `${disconnectedAccountCount} ${disconnectedAccountCount === 1 ? "account needs" : "accounts need"} reconnect before new accounts are added.`
              : isConnected
                ? "Check & Sync refreshes connection health and raw bank transactions. Closed monthly reviews are not changed unless reopened."
                : "Connect the accounts that receive rent deposits or pay property expenses."}
          </p>
        </div>
        <div className="grid grid-flow-col auto-cols-max items-center gap-2 justify-start sm:justify-end">
          {isConnected ? (
            <CheckAndSyncForm
              disabled={isBankActionPending}
              onResult={handleSyncResult}
              propertyId={property.id}
            />
          ) : null}
          <Button
            disabled={isBankActionPending}
            onClick={() => void openExistingAccountPanel()}
            type="button"
            variant="secondary"
          >
            <Link2
              className={cn(
                "h-4 w-4",
                isLoadingExistingAccounts ? "animate-pulse" : ""
              )}
            />
            {isLoadingExistingAccounts
              ? "Loading"
              : isExistingAccountPanelOpen
                ? "Hide Existing"
                : "Use Existing"}
          </Button>
          <Button
            disabled={isDisabled}
            onClick={openPlaidLink}
            type="button"
            variant={isConnected ? "secondary" : "default"}
          >
            <Landmark className="h-4 w-4" />
            {isConnecting ? "Connecting" : isConnected ? "Add Accounts" : "Connect Accounts"}
          </Button>
        </div>
      </div>

      {hasDisconnectedAccounts ? (
        <div className="flex max-w-2xl items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 shadow-sm dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-300">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Use Reconnect to repair an existing bank link. Add Accounts creates a new link.</p>
        </div>
      ) : null}

      {isExistingAccountPanelOpen ? (
        <div className="grid gap-3 rounded-md border border-border bg-card p-3 shadow-sm">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-sky-100 bg-sky-50 text-sky-700">
              <Link2 className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Link existing bank account</p>
              <p className="text-xs text-muted-foreground">
                Reuse a bank account already connected in WealthVibe without creating a new
                Plaid Item.
              </p>
            </div>
          </div>

          {isLoadingExistingAccounts ? (
            <p className="text-xs font-semibold text-muted-foreground">
              Loading existing bank accounts...
            </p>
          ) : null}

          {!isLoadingExistingAccounts && existingAccountState.connections.length === 0 ? (
            <p
              className={cn(
                "rounded-md border px-3 py-2 text-xs font-semibold",
                existingAccountState.status === "error"
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800/70 dark:bg-red-950/35 dark:text-red-300"
                  : "border-border bg-secondary text-muted-foreground"
              )}
            >
              {existingAccountState.message || "No existing bank accounts are available."}
            </p>
          ) : null}

          {!isLoadingExistingAccounts && existingAccountState.connections.length > 0 ? (
            <div className="grid gap-2">
              {existingAccountState.connections.map((connection) => {
                const isLinking = linkingExistingConnectionId === connection.sourceConnectionId;
                const accountMeta = [
                  connection.institutionName ?? "Connected account",
                  formatLastFour(connection.lastFour),
                  connection.accountSubtype ?? connection.accountType
                ].filter(Boolean);

                return (
                  <div
                    className="flex flex-col gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                    key={connection.sourceConnectionId}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{connection.accountName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {accountMeta.join(" · ")}
                      </p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        Used by {formatLinkedPropertyCount(connection.linkedPropertyCount)}.
                      </p>
                    </div>
                    <Button
                      className="w-fit shadow-sm"
                      disabled={Boolean(linkingExistingConnectionId)}
                      onClick={() => void linkExistingAccount(connection.sourceConnectionId)}
                      size="sm"
                      type="button"
                    >
                      <Link2 className={cn("h-4 w-4", isLinking ? "animate-pulse" : "")} />
                      {isLinking ? "Linking" : "Link"}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {syncState.message ? (
        <p
          className={cn(
            "max-w-2xl text-xs font-semibold sm:ml-auto sm:text-right",
            syncState.status === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
          )}
        >
          {syncState.message}
        </p>
      ) : null}

      {isConnected ? (
        <div className="grid gap-2">
          {connectedAccounts.map((connection) => (
            <div
              className="flex flex-col gap-2 rounded-md border border-border bg-secondary p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              key={connection.id}
            >
              <div>
                <p className="font-semibold">{connection.accountName}</p>
                <p className="mt-1 text-muted-foreground">
                  {connection.institutionName ?? "Connected account"}
                </p>
                <p className="mt-2 text-xs font-medium text-muted-foreground">
                  Last check & sync: {formatConnectionTimestamp(connection.lastSyncedAt)}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <ConnectionStatusBadge status={connection.status} />
                  <span className="inline-flex h-7 w-fit items-center rounded-full border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground shadow-sm">
                    {formatLastFour(connection.lastFour)}
                  </span>
                </div>
                {connection.status !== "active" ? (
                  <Button
                    className="w-fit shadow-sm"
                    disabled={isDisabled}
                    onClick={() => void openPlaidReconnect(connection)}
                    size="sm"
                    type="button"
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4",
                        reconnectingConnectionId === connection.id ? "animate-spin" : ""
                      )}
                    />
                    {reconnectingConnectionId === connection.id
                      ? "Reconnecting"
                      : "Reconnect"}
                  </Button>
                ) : null}
                <RemoveConnectionForm connection={connection} propertyId={property.id} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {state.message ? (
        <p
          className={cn(
            "text-sm font-semibold",
            state.status === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
          )}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
