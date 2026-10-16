import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { P } from '../../auth/permissions';
import { useToast } from '../../components/toast';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { formatCount, formatMoney, humanize } from '../../lib/format';
import { leadKeys, leadsApi } from './api';
import { StageChangeModal, useLeadInvalidation, type StageMoveRequest } from './LeadWidgets';
import { checkStageMove, displayName, moveCard, qualityTone } from './logic';
import type { PipelineBoard, PipelineCard, PipelineColumn } from './types';
import './leads.css';

type PendingMove = { card: PipelineCard; toStageId: string };

/** /pipeline — kanban board by stage (mobile PipelineBoardPage). */
export function PipelinePage() {
  const { can } = useAuth();
  const canMove = can(P.leadChangeStage);
  const toast = useToast();
  const qc = useQueryClient();
  const invalidate = useLeadInvalidation();
  const board = useQuery({ queryKey: leadKeys.board, queryFn: leadsApi.board });
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);

  const data = board.data;
  const stages = data?.columns.map((c) => c.stage) ?? [];

  const commit = async (card: PipelineCard, req: StageMoveRequest) => {
    setMovingId(card.id);
    setPending(null);
    // Optimistic move; the refetch below reconciles counts and ordering.
    qc.setQueryData<PipelineBoard>(leadKeys.board, (old) => (old ? { ...old, columns: moveCard(old.columns, card.id, req.stageId) } : old));
    try {
      await leadsApi.changeStage(card.id, { ...req, version: card.version });
      toast.success('Stage updated');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setMovingId(null);
      await invalidate(card.id);
    }
  };

  const requestMove = (card: PipelineCard, toStageId: string) => {
    if (!data || movingId) return;
    const check = checkStageMove(stages, card.stageId, toStageId, data.lossReasons.length);
    if (!check.ok) {
      if (check.reason === 'no_loss_reasons') toast.error('Add a loss reason before marking Lost.');
      return;
    }
    if (check.needsLossReason) setPending({ card, toStageId });
    else void commit(card, { stageId: toStageId });
  };

  const findCard = (id: string) => data?.columns.flatMap((c) => c.leads).find((l) => l.id === id);

  const onDrop = (e: DragEvent, stageId: string) => {
    e.preventDefault();
    setHoverStage(null);
    const id = e.dataTransfer.getData('text/plain') || dragId;
    setDragId(null);
    const card = id ? findCard(id) : undefined;
    if (card) requestMove(card, stageId);
  };

  return (
    <>
      <PageHeader
        title={data?.pipeline.name ?? 'Pipeline'}
        subtitle={canMove ? 'Drag a card to another stage, or use its “Move to” menu.' : 'Leads by stage.'}
        actions={
          <>
            <Link className="btn btn-ghost" to="/reports/pipeline">
              Conversion analytics
            </Link>
            <button type="button" className="btn btn-ghost" onClick={() => board.refetch()} disabled={board.isFetching}>
              {board.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </>
        }
      />

      {board.isLoading ? (
        <Spinner />
      ) : board.isError ? (
        <ErrorState error={board.error} onRetry={() => board.refetch()} />
      ) : !data || data.columns.length === 0 ? (
        <EmptyState>No pipeline stages configured.</EmptyState>
      ) : (
        <>
          <dl className="leads-totals">
            {[
              ['Leads', formatCount(data.totals.leads)],
              ['Open', formatCount(data.totals.open)],
              ['Won', formatCount(data.totals.won)],
              ['Lost', formatCount(data.totals.lost)],
              ['Pipeline', formatMoney(data.totals.pipelineValueMinor)],
            ].map(([label, value]) => (
              <div key={label} className="card leads-total">
                <dt className="muted small">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="leads-board" role="list">
            {data.columns.map((col) => (
              <BoardColumn
                key={col.stage.id}
                column={col}
                stages={stages}
                canMove={canMove}
                hovering={hoverStage === col.stage.id}
                movingId={movingId}
                onDragOver={(e) => {
                  if (!canMove || !dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (hoverStage !== col.stage.id) setHoverStage(col.stage.id);
                }}
                onDragLeave={() => setHoverStage((s) => (s === col.stage.id ? null : s))}
                onDrop={(e) => onDrop(e, col.stage.id)}
                onDragStart={(card, e) => {
                  e.dataTransfer.setData('text/plain', card.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDragId(card.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setHoverStage(null);
                }}
                onMove={requestMove}
              />
            ))}
          </div>
        </>
      )}

      <StageChangeModal
        open={!!pending}
        stages={stages}
        lossReasons={data?.lossReasons ?? []}
        currentStageId={pending?.card.stageId ?? ''}
        fixedStageId={pending?.toStageId}
        busy={!!movingId}
        onClose={() => setPending(null)}
        onSubmit={(req) => pending && commit(pending.card, req)}
      />
    </>
  );
}

function BoardColumn({
  column,
  stages,
  canMove,
  hovering,
  movingId,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  column: PipelineColumn;
  stages: Array<{ id: string; name: string }>;
  canMove: boolean;
  hovering: boolean;
  movingId: string | null;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
  onDragStart: (card: PipelineCard, e: DragEvent) => void;
  onDragEnd: () => void;
  onMove: (card: PipelineCard, toStageId: string) => void;
}) {
  const { stage } = column;
  const tone = stage.isWon ? 'won' : stage.isLost ? 'lost' : 'open';
  return (
    <section
      className={`leads-col${hovering ? ' leads-col-hover' : ''}`}
      role="listitem"
      aria-label={stage.name}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className={`leads-col-head leads-col-${tone}`}>
        <strong>{stage.name}</strong>
        <span className="small">
          {formatCount(column.count)} · {formatMoney(column.valueMinor)}
        </span>
      </header>
      <div className="leads-col-body">
        {column.leads.length === 0 ? <p className="muted small leads-col-empty">{hovering ? 'Drop here' : 'No leads'}</p> : null}
        {column.leads.map((card) => (
          <article
            key={card.id}
            className={`leads-kcard${movingId === card.id ? ' leads-kcard-moving' : ''}`}
            draggable={canMove && !movingId}
            onDragStart={(e) => onDragStart(card, e)}
            onDragEnd={onDragEnd}
          >
            <Link to={`/leads/${card.id}`} className="leads-kcard-title">
              {displayName(card)}
            </Link>
            <div className="muted small">
              {card.leadNumber}
              {card.ownerName ? ` · ${card.ownerName}` : ''}
            </div>
            <div className="btn-row">
              {card.quality ? <Badge value={humanize(card.quality)} tone={qualityTone(card.quality)} /> : null}
              <span className="small">{formatMoney(card.estimatedValueMinor, card.currency)}</span>
            </div>
            {canMove ? (
              <select
                className="input leads-kcard-move"
                aria-label={`Move ${displayName(card)} to stage`}
                value=""
                disabled={!!movingId}
                onChange={(e) => e.target.value && onMove(card, e.target.value)}
              >
                <option value="">Move to…</option>
                {stages
                  .filter((s) => s.id !== card.stageId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            ) : null}
          </article>
        ))}
        {column.count > column.leads.length ? (
          <p className="muted small leads-col-empty">+{formatCount(column.count - column.leads.length)} more — see Leads list</p>
        ) : null}
      </div>
    </section>
  );
}
