import mongoose, { Document, Schema } from "mongoose";

// A sellable extra the office charges at the counter: a tie, a sweater, a book set,
// a replacement ID card. Deliberately NOT a FeeHead — fee heads feed the monthly fee
// structures, and a tie must never end up billed to a whole class every month.
//
// This is only a convenience list: it pre-fills the name and price so the clerk isn't
// retyping "Tie" and "150" (and mistyping them) on every sale, and so the per-item
// report groups by one spelling instead of four. A charge can still be added with a
// free-typed name when it's a genuine one-off, which is why nothing here is required
// on the invoice side.
export interface IChargeItem extends Document {
  name: string;
  amount: number; // default price; the clerk can override it per sale
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const chargeItemSchema = new Schema<IChargeItem>(
  {
    name: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// One entry per name — two "Tie" rows with different prices is a data-entry mistake,
// not a feature. Case-insensitive so "tie" can't sneak in beside "Tie".
chargeItemSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

export const ChargeItem = mongoose.model<IChargeItem>("ChargeItem", chargeItemSchema);
