from app.enums import RecoveryActionType, RecoveryAttemptStatus
from app.executors.base import ExecutionContext, ExecutionOutcome, RecoveryActionExecutor


class NoActionExecutor(RecoveryActionExecutor):
    """
    Dispatched when the policy engine's final_action is NO_ACTION — e.g.
    the retry delay hasn't elapsed yet, or the engine judged recovery not
    worthwhile right now. Makes no provider call at all; SKIPPED (not
    SUCCESS) is the accurate status for a deliberate no-op, distinct from
    an action that ran and worked.
    """

    action_type = RecoveryActionType.NO_ACTION

    def execute(self, context: ExecutionContext) -> ExecutionOutcome:
        return ExecutionOutcome(
            status=RecoveryAttemptStatus.SKIPPED,
            result_message=f"No recovery action taken. {context.policy_reason}",
        )
