-- 0023 · The new-order notification fires at commit, not at insert
--
-- Bug: every queued message carried an empty set summary.
--
-- 0022 hung the trigger on `after insert on orders for each row` and its own
-- comment claimed this ran "after the items exist". It does not. place_order
-- inserts the order first and the order_items afterwards, so the trigger ran
-- while the order had no lines at all and the summary aggregated over nothing.
--
-- A constraint trigger deferred to commit sees the finished transaction: the
-- order, its items, its fillings, its payment. That is the only moment the
-- message is describable, which is the moment to build it.

drop trigger enqueue_new_order_notification on public.orders;

create constraint trigger enqueue_new_order_notification
  after insert on public.orders
  deferrable initially deferred
  for each row
  execute function private.enqueue_new_order_notification();
