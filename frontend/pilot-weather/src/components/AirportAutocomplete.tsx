import React, { useState, useEffect, useRef } from "react";
import { Input } from "./ui/input";
import { Check, X } from "lucide-react";

interface Airport {
  icao: string;
  name: string;
  city: string;
  country: string;
}

interface AirportAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onValidationChange?: (isValid: boolean) => void;
}

export function AirportAutocomplete({
  value,
  onChange,
  placeholder = "Enter airport code",
  className = "",
  onValidationChange,
}: AirportAutocompleteProps) {
  const [airports, setAirports] = useState<Airport[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const [, setSelectedAirport] = useState<Airport | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    console.log("AirportAutocomplete useEffect triggered with value:", value);
    if (value.length < 2) {
      setAirports([]);
      setIsValid(false);
      onValidationChange?.(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `https://pilot-weather-backend.onrender.com/airports/search?q=${encodeURIComponent(
            value
          )}`
        );
        const data = await response.json();
        console.log(`✅ Found ${data.length} airports:`, data);

        setAirports(data);
        setIsOpen(data.length > 0);
      } catch (error) {
        console.error("❌ Error searching airports:", error);
        setAirports([]);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
      }
    }, 150); // Reduced from 300ms to 150ms for faster response

    return () => clearTimeout(timeoutId);
  }, [value, onValidationChange]);

  // Check if current value is a valid airport
  useEffect(() => {
    if (value.length >= 3) {
      const isValidAirport = airports.some(
        (airport) => airport.icao.toUpperCase() === value.toUpperCase()
      );
      setIsValid(isValidAirport);
      onValidationChange?.(isValidAirport);
    } else {
      setIsValid(false);
      onValidationChange?.(false);
    }
  }, [value, airports, onValidationChange]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase();
    console.log("AirportAutocomplete input changed:", newValue);
    onChange(newValue);
    setSelectedAirport(null);
  };

  const handleAirportSelect = (airport: Airport) => {
    onChange(airport.icao);
    setSelectedAirport(airport);
    setIsOpen(false);
    setIsValid(true);
    onValidationChange?.(true);
  };

  const handleClear = () => {
    onChange("");
    setSelectedAirport(null);
    setIsValid(false);
    onValidationChange?.(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          className={`pr-20 ${className} ${
            value && !isValid ? "border-red-500 focus:border-red-500" : ""
          }`}
          onFocus={() => value.length >= 2 && setIsOpen(true)}
        />

        {/* Clear button */}
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-8 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Validation indicator */}
        {value && (
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
            {isValid ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <X className="w-4 h-4 text-red-500" />
            )}
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto"
        >
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-gray-500">Searching...</div>
          ) : airports.length > 0 ? (
            airports.map((airport) => (
              <button
                key={airport.icao}
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                onClick={() => handleAirportSelect(airport)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">
                      {airport.icao}
                    </div>
                    <div className="text-sm text-gray-500">{airport.name}</div>
                    <div className="text-xs text-gray-400">
                      {airport.city}, {airport.country}
                    </div>
                  </div>
                </div>
              </button>
            ))
          ) : value.length >= 2 ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              No results found
            </div>
          ) : null}
        </div>
      )}

      {/* Error message */}
      {value && !isValid && value.length >= 3 && (
        <div className="mt-1 text-xs text-red-500">
          Airport not found. Please select from the dropdown.
        </div>
      )}
    </div>
  );
}
