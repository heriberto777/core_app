import { useState, useRef, useEffect, useMemo } from "react";
import { FaChevronDown, FaTimes, FaCheck, FaSearch } from "react-icons/fa";

/**
 * Corporate MultiSelectInput (Tailwind Edition)
 */
export function MultiSelectInput({
  label,
  value = [],
  onChange,
  options = [],
  placeholder = "Seleccionar...",
  showTags = true,
  maxTagsShown = 3,
  searchThreshold = 5,
  className = "",
  ...props
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectRef = useRef(null);
  const searchInputRef = useRef(null);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const searchLower = search.toLowerCase();
    return options.filter(opt => 
      opt.label?.toLowerCase().includes(searchLower) || 
      String(opt.value).toLowerCase().includes(searchLower)
    );
  }, [options, search]);

  const showSearch = options.length > searchThreshold;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearch("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, showSearch]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSearch("");
    }
  };

  const handleOptionClick = (optionValue) => {
    const newValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    onChange?.(newValue);
  };

  const handleRemoveTag = (optionValue, event) => {
    event.stopPropagation();
    const newValue = value.filter((v) => v !== optionValue);
    onChange?.(newValue);
  };

  const getDisplayText = () => {
    if (value.length === 0) return placeholder;
    if (value.length === 1) {
      const option = options.find((opt) => opt.value === value[0]);
      return option?.label || value[0];
    }
    return `${value.length} seleccionados`;
  };

  const getSelectedOptions = () => {
    return value
      .map((val) => options.find((opt) => opt.value === val))
      .filter(Boolean);
  };

  return (
    <div ref={selectRef} className={`relative w-full ${className}`}>
      {label && (
        <label className="text-xs font-medium text-slate-500 block mb-1">
          {label}
        </label>
      )}

      <button
        type="button"
        onClick={handleToggle}
        className={`
          w-full px-3 py-2 border rounded-md bg-white text-left cursor-pointer flex justify-between items-center
          transition-colors duration-200
          ${isOpen ? "border-primary-500 ring-2 ring-primary-500/20" : "border-slate-300 hover:border-slate-400"}
        `}
        {...props}
      >
        <span className={`flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${value.length > 0 ? "text-slate-800" : "text-slate-400"}`}>
          {getDisplayText()}
          {value.length > 1 && (
            <span className="ml-1.5 bg-primary-500 text-white rounded-full px-1.5 py-0.5 text-[11px] font-medium">
              {value.length}
            </span>
          )}
        </span>
        <FaChevronDown className={`text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {showTags && value.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {getSelectedOptions()
            .slice(0, maxTagsShown)
            .map((option) => (
              <div
                key={option.value}
                className="flex items-center gap-1 bg-primary-50 text-primary-600 border border-primary-200/30 rounded px-1.5 py-0.5 text-[11px] max-w-[150px]"
              >
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{option.label}</span>
                <button
                  onClick={(e) => handleRemoveTag(option.value, e)}
                  className="text-primary-500 hover:opacity-70 p-0 bg-transparent border-none cursor-pointer"
                >
                  <FaTimes size={8} />
                </button>
              </div>
            ))}
          {value.length > maxTagsShown && (
            <div className="flex items-center gap-1 bg-primary-50 text-primary-600 border border-primary-200/30 rounded px-1.5 py-0.5 text-[11px]">
              <span>+{value.length - maxTagsShown} más</span>
            </div>
          )}
        </div>
      )}

      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-[1000] bg-white border border-slate-200 rounded-md shadow-lg mt-0.5 max-h-[250px] overflow-y-auto">
          {showSearch && (
            <div className="sticky top-0 bg-white p-2 border-b border-slate-200">
              <div className="relative">
                <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full pl-7 pr-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>
          )}
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <div
                key={option.value}
                onClick={() => handleOptionClick(option.value)}
                className="px-3 py-2 cursor-pointer flex items-center gap-2 hover:bg-slate-50 transition-colors"
              >
                <FaCheck className={`text-primary-500 text-xs ${value.includes(option.value) ? "opacity-100" : "opacity-0"}`} />
                <span className="flex-1 text-sm text-slate-800">{option.label}</span>
              </div>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-slate-400 text-sm">
              Sin resultados
            </div>
          )}
        </div>
      )}
    </div>
  );
}