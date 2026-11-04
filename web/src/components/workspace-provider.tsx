"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  OwnerWallet,
  readWallet,
  walletError,
  receiptMatchesPending,
  type InjectedProvider,
  type WalletState,
} from "../lib/wallet";
import type { WorkspaceSnapshot, LaunchChallenge } from "../lib/model";
import { PUBLIC_DEMO_ONLY } from "../lib/paypal-agent";
interface ProviderChoice {
  id: string;
  name: string;
  provider: InjectedProvider;
}
interface Notice {
  message: string;
  kind: "success" | "error" | "pending";
  hash?: string;
}
const empty: WorkspaceSnapshot = {
  configured: false,
  chainTime: 0,
  model: "mock",
  geminiAvailable: false,
  mandates: [],
  payments: [],
  runs: [],
  events: [],
};
interface Context {
  snapshot: WorkspaceSnapshot;
  loading: boolean;
  offline: boolean;
  wallet: WalletState | null;
  choices: ProviderChoice[];
  notice: Notice | null;
  refresh: () => Promise<void>;
  connect: (id?: string) => Promise<void>;
  disconnect: () => void;
  ownerWallet: () => OwnerWallet;
  launch: (id: string, resume?: boolean) => Promise<string>;
  post: (action: string, body: unknown) => Promise<Record<string, string>>;
  perform: <T>(
    work: () => Promise<T>,
    success: string,
  ) => Promise<T | undefined>;
  busy: boolean;
  notify: (notice: Notice | null) => void;
}
const WorkspaceContext = createContext<Context | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace context missing");
  return value;
}
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(empty),
    [loading, setLoading] = useState(true),
    [offline, setOffline] = useState(false),
    [wallet, setWallet] = useState<WalletState | null>(null),
    [choices, setChoices] = useState<ProviderChoice[]>([]),
    [notice, setNotice] = useState<Notice | null>(null),
    [busy, setBusy] = useState(false);
  const provider = useRef<InjectedProvider | null>(null);
  const [connectedProvider, setConnectedProvider] =
    useState<InjectedProvider | null>(null);
  const syncing = useRef(false);
  const lastSubmitted = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    let readError = "STATE_UNAVAILABLE";
    try {
      const response = await fetch("/api/workspace", {
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        if (
          [
            "HISTORY_SYNCING",
            "WORKER_STARTING",
            "SERVICE_RESTARTING",
            "BACKEND_WAKING_OR_UNAVAILABLE",
          ].includes(failure?.error)
        )
          readError = failure.error;
        throw new Error("State unavailable");
      }
      const next = (await response.json()) as WorkspaceSnapshot;
      if (next.configured) {
        setSnapshot(next);
        setOffline(false);
      } else {
        setSnapshot((previous) => (previous.configured ? previous : next));
        setOffline(
          next.error !== "WORKSPACE_NOT_CONFIGURED" &&
            next.error !== "PUBLIC_DEMO_READ_ONLY",
        );
      }
    } catch {
      setSnapshot((previous) => ({ ...previous, error: readError }));
      setOffline(true);
    } finally {
      setLoading(false);
      syncing.current = false;
    }
  }, []);
  useEffect(() => {
    void refresh();
    if (PUBLIC_DEMO_ONLY) return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [refresh]);
  const watch = useCallback((p: InjectedProvider) => {
    provider.current = p;
    setConnectedProvider(p);
  }, []);
  useEffect(() => {
    const found = new Map<string, ProviderChoice>();
    const add = (item: ProviderChoice) => {
      found.set(item.id, item);
      setChoices([...found.values()]);
      if (localStorage.getItem("flint-wallet") === item.id) {
        watch(item.provider);
        void readWallet(item.provider)
          .then(setWallet)
          .catch(() => setWallet(null));
      }
    };
    const announce = (event: Event) => {
      const d = (
        event as CustomEvent<{
          info: { uuid: string; name: string };
          provider: InjectedProvider;
        }>
      ).detail;
      if (
        d?.provider &&
        typeof d.provider.request === "function" &&
        d.info?.uuid
      )
        add({
          id: d.info.uuid,
          name: d.info.name.slice(0, 60),
          provider: d.provider,
        });
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const fallback = (window as Window & { ethereum?: InjectedProvider })
      .ethereum;
    if (fallback && !found.size)
      add({ id: "injected", name: "Injected wallet", provider: fallback });
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, [watch]);
  useEffect(() => {
    const p = connectedProvider;
    if (!p) return;
    const update = () => {
      setNotice(null);
      void readWallet(p)
        .then(setWallet)
        .catch(() => setWallet(null));
    };
    const removed = () => {
      setWallet(null);
      provider.current = null;
      setConnectedProvider(null);
      localStorage.removeItem("flint-wallet");
    };
    p.on?.("accountsChanged", update);
    p.on?.("chainChanged", update);
    p.on?.("disconnect", removed);
    return () => {
      p.removeListener?.("accountsChanged", update);
      p.removeListener?.("chainChanged", update);
      p.removeListener?.("disconnect", removed);
    };
  }, [connectedProvider]);
  const connect = async (id?: string) => {
    const choice = choices.find((p) => p.id === id) ?? choices[0];
    if (!choice) {
      setNotice({
        kind: "error",
        message: "Install or enable MetaMask or Rabby to connect a wallet.",
      });
      return;
    }
    try {
      const state = await readWallet(choice.provider, true);
      if (!state) throw new Error("Wallet did not authorize an account.");
      watch(choice.provider);
      setWallet(state);
      localStorage.setItem("flint-wallet", choice.id);
      setNotice(null);
    } catch (error) {
      setNotice({ kind: "error", message: walletError(error) });
    }
  };
  const disconnect = () => {
    provider.current = null;
    setConnectedProvider(null);
    setWallet(null);
    localStorage.removeItem("flint-wallet");
    setNotice(null);
  };
  const ownerWallet = useCallback(() => {
    if (!provider.current || !snapshot.config || !wallet)
      throw new Error("Connect your wallet to a configured local vault.");
    return new OwnerWallet(provider.current, snapshot.config, (hash, kind) => {
      lastSubmitted.current = hash;
      localStorage.setItem(
        "flint-pending",
        JSON.stringify({
          hash,
          kind,
          vault: snapshot.config?.vault,
          chainId: snapshot.config?.chainId,
        }),
      );
      setNotice({
        kind: "pending",
        message: `${kind} submitted. Waiting for confirmation.`,
        hash,
      });
    });
  }, [snapshot.config, wallet]);
  const post = useCallback(async (action: string, body: unknown) => {
    const response = await fetch(`/api/workspace/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const result = (await response.json()) as Record<string, string>;
    if (!response.ok) throw new Error(result.error ?? "Request failed");
    return result;
  }, []);
  const launch = async (id: string, resume = false) => {
    const raw = await post("challenge", {
      mandateId: id,
      action: resume ? "resume" : "launch",
    });
    const c = raw as unknown as LaunchChallenge;
    const signature = await ownerWallet().sign(c);
    const result = await post("launch", { nonce: c.nonce, signature });
    await refresh();
    if (!result.runId)
      throw new Error(
        "Run identity was not returned. Reconcile existing runs before retrying.",
      );
    return result.runId;
  };
  const perform = async <T,>(work: () => Promise<T>, success: string) => {
    if (busy) return;
    setBusy(true);
    lastSubmitted.current = null;
    try {
      const pending = localStorage.getItem("flint-pending");
      if (pending) {
        const saved = JSON.parse(pending) as {
          hash: `0x${string}`;
          vault: string;
          chainId: number;
        };
        if (
          saved.vault !== snapshot.config?.vault ||
          saved.chainId !== wallet?.chainId
        )
          throw new Error(
            "A saved transaction belongs to another vault or chain. Review it before continuing.",
          );
        try {
          await ownerWallet()
            .clients()
            .public.getTransactionReceipt({ hash: saved.hash });
          localStorage.removeItem("flint-pending");
        } catch {
          throw new Error(
            "Previous transaction remains unconfirmed. Reconcile it before sending another.",
          );
        }
      }
      const value = await work();
      setNotice({ kind: "success", message: success });
      if (
        lastSubmitted.current &&
        snapshot.config &&
        receiptMatchesPending(
          localStorage.getItem("flint-pending"),
          lastSubmitted.current,
          snapshot.config,
        )
      )
        localStorage.removeItem("flint-pending");
      await refresh();
      return value;
    } catch (error) {
      setNotice({ kind: "error", message: walletError(error) });
      await refresh();
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!wallet || !snapshot.config || snapshot.chainTime <= 0) return;
    const pending = localStorage.getItem("flint-pending");
    if (!pending) return;
    try {
      const item = JSON.parse(pending) as {
        hash: string;
        vault: string;
        chainId: number;
        kind: string;
      };
      if (
        item.vault !== snapshot.config.vault ||
        item.chainId !== wallet.chainId
      )
        return;
      const config = snapshot.config;
      const client = ownerWallet().clients().public;
      void client
        .getTransactionReceipt({ hash: item.hash as `0x${string}` })
        .then((receipt) => {
          if (
            !receiptMatchesPending(
              localStorage.getItem("flint-pending"),
              item.hash,
              config,
            )
          )
            return;
          setNotice({
            kind: receipt.status === "success" ? "success" : "error",
            message: `${item.kind}: ${receipt.status === "success" ? "confirmed" : "reverted"}`,
            hash: item.hash,
          });
          localStorage.removeItem("flint-pending");
        })
        .catch(() => {
          if (
            !receiptMatchesPending(
              localStorage.getItem("flint-pending"),
              item.hash,
              config,
            )
          )
            return;
          setNotice({
            kind: "pending",
            message:
              "Previous transaction is unconfirmed. Reconcile it before sending again.",
            hash: item.hash,
          });
        });
    } catch {
      setNotice({
        kind: "error",
        message: "Saved transaction state needs review.",
      });
    }
  }, [
    wallet?.account,
    wallet?.chainId,
    snapshot.config?.vault,
    wallet,
    snapshot.config,
    ownerWallet,
    snapshot.chainTime,
  ]);
  return (
    <WorkspaceContext.Provider
      value={{
        snapshot,
        loading,
        offline,
        wallet,
        choices,
        notice,
        refresh,
        connect,
        disconnect,
        ownerWallet,
        launch,
        post,
        perform,
        busy,
        notify: setNotice,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
