"use client";

import Script from "next/script";
import { useActionState, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Landmark, Trash2 } from "lucide-react";

import {
  connectTellerBank,
  removeBankConnection,
  type RealEstateActionState
} from "@/app/actions/real-estate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RealEstateAssetDetail, RealEstateBankConnection } from "@/types/wealth";

interface TellerEnrollment {
  accessToken: string;
}

interface TellerConnectInstance {
  open: () => void;
}

interface TellerConnectSetup {
  applicationId: string;
  environment: string;
  products: string[];
  selectAccount: string;
  onInit: () => void;
  onSuccess: (enrollment: TellerEnrollment) => void;
  onExit: () => void;
  onFailure: (failure: { message?: string }) => void;
}

declare global {
  interface Window {
    TellerConnect?: {
      setup: (config: TellerConnectSetup) => TellerConnectInstance;
    };
  }
}

const idleState: RealEstateActionState = {
  status: "idle",
  message: ""
};

function removeTellerIframes() {
  document.querySelectorAll('iframe[src*="teller.io/connect"]').forEach((iframe) => {
    iframe.remove();
  });
}

function formatLastFour(lastFour: string | null): string {
  return lastFour ? `•••• ${lastFour}` : "Last 4 unavailable";
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

export function TellerConnectionManager({
  applicationId,
  environment,
  property
}: {
  applicationId: string;
  environment: string;
  property: RealEstateAssetDetail;
}) {
  const router = useRouter();
  const [isScriptReady, setIsScriptReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [state, setState] = useState<RealEstateActionState>(idleState);
  const connectedAccounts = property.bankConnections;
  const isConnected = connectedAccounts.length > 0;
  const isDisabled = !applicationId || !isScriptReady || isConnecting;

  function openTellerConnect() {
    if (!applicationId) {
      setState({
        status: "error",
        message: "Teller application id is missing."
      });
      return;
    }

    if (!window.TellerConnect) {
      setState({
        status: "error",
        message: "Teller Connect is still loading."
      });
      return;
    }

    let didInitialize = false;
    const displayTimeout = window.setTimeout(() => {
      if (didInitialize) {
        return;
      }

      removeTellerIframes();
      setIsConnecting(false);
      setState({
        status: "error",
        message:
          "Teller Connect did not display. Try a regular browser window for bank linking."
      });
    }, 6000);

    setIsConnecting(true);
    setState({
      status: "idle",
      message: "Opening Teller Connect..."
    });

    try {
      const tellerConnect = window.TellerConnect.setup({
        applicationId,
        environment,
        products: ["transactions"],
        selectAccount: "multiple",
        onInit: () => {
          didInitialize = true;
          window.clearTimeout(displayTimeout);
          setIsConnecting(false);
          setState(idleState);
        },
        onSuccess: (enrollment) => {
          didInitialize = true;
          window.clearTimeout(displayTimeout);
          setIsConnecting(true);
          setState({
            status: "idle",
            message: "Saving bank connection..."
          });

          void connectTellerBank(property.id, enrollment.accessToken)
            .then((result) => {
              setState(result);

              if (result.status === "success") {
                router.refresh();
              }
            })
            .finally(() => {
              setIsConnecting(false);
            });
        },
        onExit: () => {
          didInitialize = true;
          window.clearTimeout(displayTimeout);
          removeTellerIframes();
          setIsConnecting(false);
        },
        onFailure: (failure) => {
          didInitialize = true;
          window.clearTimeout(displayTimeout);
          removeTellerIframes();
          setIsConnecting(false);
          setState({
            status: "error",
            message: failure.message || "Teller Connect could not finish."
          });
        }
      });

      tellerConnect.open();
    } catch (error) {
      window.clearTimeout(displayTimeout);
      removeTellerIframes();
      setIsConnecting(false);
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not open Teller Connect."
      });
    }
  }

  return (
    <div className="grid gap-4">
      <Script
        onLoad={() => {
          setIsScriptReady(true);
        }}
        src="https://cdn.teller.io/connect/connect.js"
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
        <Button disabled={isDisabled} onClick={openTellerConnect} type="button">
          <Landmark className="h-4 w-4" />
          {isConnecting ? "Connecting" : isConnected ? "Add Accounts" : "Connect Accounts"}
        </Button>
      </div>

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
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <span className="w-fit rounded-md border border-slate-200 bg-white px-2.5 py-1 font-semibold text-muted-foreground">
                  {formatLastFour(connection.lastFour)}
                </span>
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
