"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface PackageFiltersProps {
  currentParams: {
    location?: string;
    minPrice?: string;
    maxPrice?: string;
    duration?: string;
    sort?: string;
  };
}

export function PackageFilters({ currentParams }: PackageFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [location, setLocation] = useState(currentParams.location || "");
  const [minPrice, setMinPrice] = useState(currentParams.minPrice || "");
  const [maxPrice, setMaxPrice] = useState(currentParams.maxPrice || "");
  const [sort, setSort] = useState(currentParams.sort || "created_at");

  const applyFilters = () => {
    const params = new URLSearchParams();
    
    if (location) params.set("location", location);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (sort && sort !== "created_at") params.set("sort", sort);
    
    router.push(`/tours/browse${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const clearFilters = () => {
    setLocation("");
    setMinPrice("");
    setMaxPrice("");
    setSort("created_at");
    router.push("/tours/browse");
  };

  return (
    <div className="rounded-2xl border border-daet-ink/10 bg-white p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Location */}
        <div>
          <label htmlFor="filter-location" className="block text-xs font-bold text-daet-ink">Location</label>
          <input
            id="filter-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., Bagasbas"
            className="mt-1 w-full rounded-xl border border-daet-ink/15 px-3 py-2 text-sm outline-none transition focus:border-daet-forest focus:ring-2 focus:ring-daet-forest/20"
          />
        </div>

        {/* Price Range */}
        <div>
          <label htmlFor="filter-min-price" className="block text-xs font-bold text-daet-ink">Min Price (₱)</label>
          <input
            id="filter-min-price"
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="0"
            min="0"
            className="mt-1 w-full rounded-xl border border-daet-ink/15 px-3 py-2 text-sm outline-none transition focus:border-daet-forest focus:ring-2 focus:ring-daet-forest/20"
          />
        </div>

        <div>
          <label htmlFor="filter-max-price" className="block text-xs font-bold text-daet-ink">Max Price (₱)</label>
          <input
            id="filter-max-price"
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="No limit"
            min="0"
            className="mt-1 w-full rounded-xl border border-daet-ink/15 px-3 py-2 text-sm outline-none transition focus:border-daet-forest focus:ring-2 focus:ring-daet-forest/20"
          />
        </div>

        {/* Sort */}
        <div>
          <label htmlFor="filter-sort" className="block text-xs font-bold text-daet-ink">Sort by</label>
          <select
            id="filter-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="mt-1 w-full rounded-xl border border-daet-ink/15 px-3 py-2 text-sm outline-none transition focus:border-daet-forest focus:ring-2 focus:ring-daet-forest/20"
          >
            <option value="created_at">Newest first</option>
            <option value="title">Name (A-Z)</option>
            <option value="price">Price (Low to High)</option>
          </select>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={applyFilters}
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-daet-forest px-6 text-sm font-bold text-white transition hover:bg-daet-ink"
        >
          Apply filters
        </button>
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-daet-ink/20 px-6 text-sm font-bold text-daet-ink transition hover:bg-daet-sand"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
