"use client";

import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

import { completePlaidReconnect, connectPlaidBank } from "@/app/actions/real-estate";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PLAID_LINK_ASSET_ID_STORAGE_KEY,
  PLAID_LINK_CONNECTION_ID_STORAGE_KEY,
  PLAID_LINK_MODE_STORAGE_KEY,
  PLAID_LINK_TOKEN_STORAGE_KEY,
  type PlaidLinkMode
} from "@/components/real-estate/plaid-link-storage";
import type { PlaidLinkMetadata } from "@/components/real-estate/plaid-link-types";

function getSelectedPlaidAccountIds(metadata: PlaidLinkMetadata): string[] {
  return (metadata.accounts ?? [])
    .map((account) => account.id ?? account.account_id ?? "")
    .filter(Boolean);
}

function clearStoredPlaidLinkState() {
  window.localStorage.removeItem(PLAID_LINK_ASSET_ID_STORAGE_KEY);
  window.localStorage.removeItem(PLAID_LINK_CONNECTION_ID_STORAGE_KEY);
  window.localStorage.removeItem(PLAID_LINK_MODE_STORAGE_KEY);
  window.localStorage.removeItem(PLAID_LINK_TOKEN_STORAGE_KEY);
}

function getStoredPlaidLinkMode(): PlaidLinkMode {
  const storedMode = window.localStorage.getItem(PLAID_LINK_MODE_STORAGE_KEY);

  return storedMode === "update" ? "update" : "connect";
}

export function PlaidOAuthCallback() {
  const router = useRouter();
  const hasOpenedLink = useRef(false);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [message, setMessage] = useState("Finishing bank connection...");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const storedAssetId = window.localStorage.getItem(PLAID_LINK_ASSET_ID_STORAGE_KEY);
    setAssetId(storedAssetId);
  }, []);

  function finishOAuthLink() {
    if (hasOpenedLink.current) {
      return;
    }

    if (!window.Plaid) {
      setStatus("error");
      setMessage("Plaid Link could not load. Check your browser or network settings.");
      return;
    }

    const storedAssetId = window.localStorage.getItem(PLAID_LINK_ASSET_ID_STORAGE_KEY);
    const connectionId = window.localStorage.getItem(
      PLAID_LINK_CONNECTION_ID_STORAGE_KEY
    );
    const linkToken = window.localStorage.getItem(PLAID_LINK_TOKEN_STORAGE_KEY);
    const linkMode = getStoredPlaidLinkMode();

    if (!storedAssetId || !linkToken) {
      setStatus("error");
      setMessage("Plaid OAuth state was not found. Open bank connections and try again.");
      return;
    }

    if (linkMode === "update" && !connectionId) {
      setStatus("error");
      setMessage("Plaid reconnect state was not found. Open bank connections and try again.");
      return;
    }

    hasOpenedLink.current = true;
    setAssetId(storedAssetId);
    const handler = window.Plaid.create({
      token: linkToken,
      receivedRedirectUri: window.location.href,
      onSuccess: (publicToken, metadata) => {
        if (linkMode === "update") {
          setMessage("Saving reconnected account...");

          void completePlaidReconnect(storedAssetId, connectionId ?? "").then((result) => {
            if (result.status === "success") {
              clearStoredPlaidLinkState();
              setStatus("success");
              setMessage(result.message || "Bank account reconnected.");
              router.replace(`/real-estate/${storedAssetId}`);
              router.refresh();
              return;
            }

            setStatus("error");
            setMessage(result.message || "Could not reconnect Plaid account.");
          });
          return;
        }

        if (!publicToken) {
          setStatus("error");
          setMessage("Plaid public token is missing.");
          return;
        }

        setMessage("Saving bank connection...");

        void connectPlaidBank(
          storedAssetId,
          publicToken,
          getSelectedPlaidAccountIds(metadata)
        ).then((result) => {
          if (result.status === "success") {
            clearStoredPlaidLinkState();
            setStatus("success");
            setMessage(result.message || "Bank connection saved.");
            router.replace(`/real-estate/${storedAssetId}`);
            router.refresh();
            return;
          }

          setStatus("error");
          setMessage(result.message || "Could not save Plaid connection.");
        });
      },
      onExit: (error) => {
        clearStoredPlaidLinkState();
        setStatus("error");
        setMessage(
          error?.display_message ||
            error?.error_message ||
            "Plaid OAuth connection was not completed."
        );
      }
    });

    handler.open();
  }

  return (
    <div className="mx-auto grid min-h-[24rem] max-w-xl place-items-center px-4 py-12">
      <Script
        onError={() => {
          setStatus("error");
          setMessage("Plaid Link could not load. Check your browser or network settings.");
        }}
        onReady={finishOAuthLink}
        src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
        strategy="afterInteractive"
      />
      <div className="grid w-full gap-4 rounded-md border border-slate-200 bg-white p-6 text-center shadow-soft">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-primary">
          {status === "loading" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : status === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <TriangleAlert className="h-5 w-5 text-red-600" />
          )}
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Bank Connection</h1>
          <p className="mt-2 text-sm font-medium text-muted-foreground">{message}</p>
        </div>
        {status === "error" ? (
          <div className="flex justify-center">
            <Link
              className={cn(buttonVariants({ variant: "secondary" }))}
              href={assetId ? `/real-estate/${assetId}` : "/real-estate"}
            >
              Back to Real Estate
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
