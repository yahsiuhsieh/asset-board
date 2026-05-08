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
import { CircleAlert, CheckCircle2, Landmark, RefreshCw, Trash2 } from "lucide-react";

import {
  checkAndSyncPlaidBankConnections,
  completePlaidReconnect,
  connectPlaidBank,
  createPlaidLinkToken,
  createPlaidReconnectLinkToken,
  removeBankConnection,
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
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 ring-emerald-100"
          : "border-amber-200 bg-amber-50 text-amber-700 ring-amber-100"
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
      className="w-fit text-red-600 hover:text-red-700"
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
            state.status === "error" ? "text-red-600" : "text-emerald-600"
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
  const [syncState, setSyncState] = useState<RealEstateActionState>(idleState);
  const [state, setState] = useState<RealEstateActionState>(idleState);
  const connectedAccounts = property.bankConnections;
  const isConnected = connectedAccounts.length > 0;
  const isDisabled = !isScriptReady || isConnecting;

  useEffect(() => {
    if (window.Plaid) {
      setIsScriptReady(true);
    }
  }, []);

  const handleSyncResult = useCallback((result: RealEstateActionState) => {
    setSyncState(result);
  }, []);

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
            {isConnected
              ? "Connected accounts are used for rent deposits and property expenses."
              : "Connect the accounts that receive rent deposits or pay property expenses."}
          </p>
        </div>
        <div className="grid grid-flow-col auto-cols-max items-center gap-2 justify-start sm:justify-end">
          {isConnected ? (
            <CheckAndSyncForm
              disabled={isConnecting}
              onResult={handleSyncResult}
              propertyId={property.id}
            />
          ) : null}
          <Button disabled={isDisabled} onClick={openPlaidLink} type="button">
            <Landmark className="h-4 w-4" />
            {isConnecting ? "Connecting" : isConnected ? "Add Accounts" : "Connect Accounts"}
          </Button>
        </div>
      </div>

      {syncState.message ? (
        <p
          className={cn(
            "max-w-2xl text-xs font-semibold sm:ml-auto sm:text-right",
            syncState.status === "error" ? "text-red-600" : "text-emerald-600"
          )}
        >
          {syncState.message}
        </p>
      ) : null}

      {isConnected ? (
        <div className="grid gap-2">
          {connectedAccounts.map((connection) => (
            <div
              className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
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
                  <span className="inline-flex h-7 w-fit items-center rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-muted-foreground shadow-sm">
                    {formatLastFour(connection.lastFour)}
                  </span>
                </div>
                {connection.status !== "active" ? (
                  <Button
                    className="w-fit"
                    disabled={isDisabled}
                    onClick={() => void openPlaidReconnect(connection)}
                    size="sm"
                    type="button"
                    variant="ghost"
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
            state.status === "error" ? "text-red-600" : "text-emerald-600"
          )}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
