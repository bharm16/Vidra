import { useEffect, useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { FreshButton } from "@/components/fresh/FreshButton";
import { loadAccountUsage, type AccountUsage } from "./api/accountApi";

export function AccountUsagePanel({ ownerId }: { ownerId: string }): ReactElement {
  const [state, setState] = useState<{ ownerId: string; data?: AccountUsage; error?: string }>();
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ ownerId });
    void loadAccountUsage(ownerId, controller.signal).then(data => { if (!controller.signal.aborted) setState({ ownerId, data }); }).catch(() => { if (!controller.signal.aborted) setState({ ownerId, error: "Your usage could not load. Check your connection and try again." }); });
    return () => controller.abort();
  }, [ownerId, reload]);
  const data = state?.ownerId === ownerId ? state.data : undefined;
  const error = state?.ownerId === ownerId ? state.error : undefined;
  useEffect(() => {
    if (!data) return;
    const delay = Math.max(1_000, Math.min(2_147_483_647, Date.parse(data.resetAt) - Date.now() + 1000));
    const timer = window.setTimeout(() => setReload(value => value + 1), delay);
    return () => window.clearTimeout(timer);
  }, [data]);
  const results = { ready: "Ready", failed: "Failed", running: "Making", "needs-attention": "Needs attention", cancelled: "Cancelled" };
  const reached = data?.allowances.some(allowance => allowance.state === "reached");
  const requestPath = (request: AccountUsage["requests"][number]): string => `/app/project/${encodeURIComponent(request.projectId)}?conversation=${encodeURIComponent(request.conversationId)}&request=${encodeURIComponent(request.id)}`;
  if (error) return <><h1>Usage</h1><div className="vf-account-usage-summary is-error" role="alert"><p>Your allowance could not load.</p><FreshButton onClick={() => setReload(value => value + 1)}>Try again</FreshButton></div><h2 className="vf-account-desktop-copy">Recent requests</h2></>;
  if (!data) return <><h1>Usage</h1><div className="vf-account-usage-loading" role="status"><div className="vf-account-usage-summary"><div className="vf-account-loading-allowance" aria-hidden="true" /><p>Checking your allowance…</p></div><h2>Recent requests</h2><div className="vf-account-loading-rows" aria-hidden="true"><div /><div /><div /></div><p className="vf-account-loading-label">Loading…</p></div></>;
  return <><h1>Usage</h1>{reached ? <div className="vf-account-usage-summary is-reached" role="status"><h2 className="vf-account-desktop-copy">Testing allowance reached</h2><p className="vf-account-mobile-copy">Your current allowance is used.</p><FreshButton asChild><Link to="/app">View saved work</Link></FreshButton></div> : data.requests.length > 0 && data.allowances.some(allowance => allowance.state === "available") ? <div className="vf-account-usage-summary is-available"><h2>More room to create</h2></div> : null}
    <div className={`vf-account-recent${reached ? " is-reached" : ""}${data.requests.length ? "" : " is-empty"}`}><h2>Recent requests</h2>{data.requests.length ? <><div className="vf-account-request-heading" aria-hidden="true"><span>Request</span><span>Result</span></div>{data.requests.map(request => <div className="vf-account-request-row" key={request.id}><Link to={requestPath(request)} aria-label={`View ${request.label}`}>{request.label}</Link><span data-result={request.result}>{results[request.result]}</span></div>)}{data.requests[0] ? <FreshButton asChild tone="quiet" className="vf-account-request-details"><Link to={requestPath(data.requests[0])}>View details</Link></FreshButton> : null}</> : <p className="vf-secondary">Your accepted requests will appear here.</p>}</div>
  </>;
}
