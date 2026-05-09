import { TransactionRulesPage } from "@/components/real-estate/TransactionRulesPage";
import {
  getRealEstateAssets,
  getRealEstateTransactionRules
} from "@/lib/real-estate";

export const dynamic = "force-dynamic";

export default async function RealEstateRulesPage() {
  const [properties, rules] = await Promise.all([
    getRealEstateAssets(),
    getRealEstateTransactionRules()
  ]);

  return <TransactionRulesPage properties={properties} rules={rules} />;
}
