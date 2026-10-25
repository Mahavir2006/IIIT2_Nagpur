'use client';

import { Fragment } from 'react';
import { SYSTEM_LABEL, type CascadeChain } from '@/cascade/contract';
import { pct, useCascade } from './store';

const TRIGGER: Record<string, string> = {
  drain: 'Flood-driven cascade', road: 'Access-driven cascade', power: 'Grid-driven cascade', hospital: 'Health-system cascade',
  ems: 'Emergency-response cascade', telecom: 'Communications cascade', transit: 'Transport cascade', calls: 'Call-surge cascade',
};

export default function ChainView() {
  const snap = useCascade((s) => s.snapshot);
  const city = useCascade((s) => s.city);
  const name = (id: string) => city?.zones.find((z) => z.id === id)?.name ?? id;
  const chains = snap?.chains ?? [];
  return (
    <div className="cx-chains">
      <div className="cx-section" style={{ paddingBottom: 6 }}>
        <h3>Predicted failure sequence <span className="cx-micro">most probable order, from {80} sampled futures</span></h3>
        {!chains.length && <div className="cx-muted">No cascade predicted to reach CRITICAL within 72 h.</div>}
      </div>
      {chains.map((c) => <Chain key={c.id} c={c} name={name} />)}
    </div>
  );
}

function Chain({ c, name }: { c: CascadeChain; name: (id: string) => string }) {
  const trig = c.id.replace('cascade-', '');
  return (
    <div className="cx-chain">
      <div className="cx-chain-head">
        <b>{TRIGGER[trig] ?? 'Cascade'}</b>
        <span className="cx-muted">followed by {pct(c.support)} of futures</span>
        {c.cityCriticalEta && <span className="cx-tag bad">city CRITICAL ~{c.cityCriticalEta.median} h ({c.cityCriticalEta.p10}–{c.cityCriticalEta.p90} h)</span>}
        {c.interactsWith.map((o) => <span key={o} className="cx-tag warn">interacts with {TRIGGER[o.replace('cascade-', '')]?.toLowerCase() ?? o}</span>)}
      </div>
      <div className="cx-stages">
        {c.stages.map((st, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <div className="cx-arrow" title={st.link ? `learned link ${st.causedBy?.system} → ${st.node.system}: weight ${st.link.weight.toFixed(2)}, lag ${st.link.lagH.toFixed(1)} h, confidence ${pct(st.link.confidence)}\nevidence: ${st.link.evidence.map((e) => `${e.sourceId} ${e.value} ${e.unit} (trust ${pct(e.trust)})`).join('; ')}` : 'ordering only (no learned direct link)'}>
                <span className="a">→</span>
                {st.link ? <span>{st.causedBy?.system}<br />lag {st.link.lagH.toFixed(1)} h</span> : <span>then</span>}
              </div>
            )}
            <div className="cx-stage" style={{ borderColor: st.prob > 0.6 ? 'rgba(229,72,77,0.6)' : undefined }}>
              <span className="s">{SYSTEM_LABEL[st.node.system]}</span>
              <span className="z">{name(st.node.zoneId)}</span>
              <span className="cx-num">{st.eta.median === 0 ? 'now' : `~${st.eta.median} h`} <span className="cx-dim">[{st.eta.p10}–{st.eta.p90}]</span></span>
              <span className="cx-num cx-muted">P {pct(st.prob)}</span>
            </div>
          </Fragment>
        ))}
        <div className="cx-arrow"><span className="a">→</span><span>CRITICAL<br />cascade</span></div>
      </div>
      <div className="cx-tags">
        {c.branches.map((b) => <span key={b.chainId} className="cx-tag">branch after stage {b.atStage}: {b.chainId.split('alt-')[1]?.split('@')[0]} first ({pct(b.support)})</span>)}
        {c.loops.map((l, i) => <span key={i} className="cx-tag acc">↻ {l.length === 1 ? `${l[0].system} spills across neighbouring zones` : l.map((n) => n.system).join(' ⇄ ')}</span>)}
      </div>
    </div>
  );
}
