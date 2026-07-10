import api from "./api";
import { SCHOOL } from "./school";

// Loads the Razorpay checkout script once.
function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

interface Payer {
  name?: string;
  email?: string;
  phone?: string;
}

// Full online-payment flow: create order -> open checkout -> verify. Resolves with the verify response.
export async function payInvoiceOnline(invoiceId: string, amount: number, payer: Payer) {
  const ok = await loadRazorpay();
  if (!ok) throw new Error("Could not load the payment gateway");

  const { data } = await api.post("/payments/razorpay/order", { invoiceId, amount });
  const { order, keyId } = data;

  return new Promise((resolve, reject) => {
    const rzp = new (window as any).Razorpay({
      key: keyId,
      amount: order.amount,
      currency: order.currency,
      name: SCHOOL.fullName,
      description: "School fee payment",
      order_id: order.id,
      prefill: { name: payer.name, email: payer.email, contact: payer.phone },
      theme: { color: "#2C6FE6" },
      handler: async (response: any) => {
        try {
          const verify = await api.post("/payments/razorpay/verify", {
            invoiceId,
            amount,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          resolve(verify.data);
        } catch (err) {
          reject(err);
        }
      },
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
    });
    rzp.open();
  });
}
