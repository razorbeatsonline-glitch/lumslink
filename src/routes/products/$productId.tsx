import { Link, createFileRoute } from '@tanstack/react-router'
import products from '../../data/products'

export const Route = createFileRoute('/products/$productId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { productId } = Route.useParams()
  const normalizedId = Number(productId)
  const product = Number.isFinite(normalizedId)
    ? products.find((item) => item.id === normalizedId)
    : undefined

  if (!product) {
    return <ProductNotFound />
  }

  return (
    <div className="flex flex-col md:flex-row gap-8 p-5">
      <div className="w-full md:w-[55%]">
        <img
          src={product.image}
          alt={product.name}
          className="w-full rounded-2xl object-cover"
        />
      </div>

      <div className="w-full md:w-[45%] p-8">
        <Link to="/" className="inline-block mb-4">
          &larr; Back to all products
        </Link>
        <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
        <p className="mb-6">{product.description}</p>
        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold">
            ${product.price.toLocaleString()}
          </div>
          <button className="px-6 py-2 rounded-lg border">
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductNotFound() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold text-sky-950">Product not found</h1>
      <p className="mt-2 text-sky-700">The link is invalid or this product no longer exists.</p>
      <Link to="/" className="mt-4 inline-block text-sky-700 underline">
        Back to home
      </Link>
    </div>
  )
}
