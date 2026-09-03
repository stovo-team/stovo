-- Earlier Ent schema bootstraps used actor_user_id as the implicit primary
-- key. Idempotency requires one operation per (actor, operation) pair, so
-- replace that legacy key with the Atlas-owned composite key.
ALTER TABLE client_operations
    DROP CONSTRAINT IF EXISTS client_operations_pkey;

ALTER TABLE client_operations
    DROP CONSTRAINT IF EXISTS clientoperation_actor_user_id_operation_id;

DROP INDEX IF EXISTS clientoperation_actor_user_id_operation_id;

ALTER TABLE client_operations
    ADD CONSTRAINT client_operations_pkey
    PRIMARY KEY (actor_user_id, operation_id);
