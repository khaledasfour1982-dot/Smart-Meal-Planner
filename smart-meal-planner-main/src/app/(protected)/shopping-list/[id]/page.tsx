import ShoppingListDetailClient from "./client-page";

export default async function ShoppingListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShoppingListDetailClient listId={id} />;
}