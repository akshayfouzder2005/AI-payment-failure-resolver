import { useParams } from "react-router-dom";
import { ComingSoon } from "../components/ui/ComingSoon";

export function PaymentDetailPage() {
  const { paymentId } = useParams();
  return (
    <ComingSoon
      title="Payment detail"
      note={`The Decision Chain, AI Decision Brief, Policy Gate, Recovery Attempt, and Audit Timeline for payment ${paymentId} — built in a later increment.`}
    />
  );
}
