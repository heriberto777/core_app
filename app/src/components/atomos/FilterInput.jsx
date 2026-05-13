import React, { useState, useMemo, useRef, useEffect } from "react";
import { FaSearch, FaChevronDown, FaTimes } from "react-icons/fa";

/**
 * Corporate FilterInput (Tailwind Edition)
 */
export const FilterInput = ({
  type = "text",
  label,
  value,
  onChange,
  placeholder,
  options = [],
  disabled = false,
  required = false,
  error = null,
  helpText = null,
  icon = null,
  showSearchIcon = false,
  className = "",
  style,
  searchThreshold = 10,
  ...props
}) => {
  const [selectSearch, setSelectSearch] = useState("");
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const selectRef = useRef(null);

  const filteredOptions = useMemo(() => {
    if (!selectSearch.trim()) return options;
    const search = selectSearch.toLowerCase();
    return options.filter(opt => 
      opt.label?.toLowerCase().includes(search) || 
      String(opt.value).toLowerCase().includes(search)
    );
  }, [options, selectSearch]);

  const showSearch = type === "select" && options.length > searchThreshold;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) {
        setIsSelectOpen(false);
        setSelectSearch("");
      }
    };
    if (isSelectOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isSelectOpen]);

  const handleSelectOptionClick = (optionValue) => {
    if (onChange) {
      const callbackSource = onChange.toString();
      const expectsEvent = callbackSource.includes('.target');
      if (expectsEvent) {
        onChange({ target: { value: optionValue } });
      } else {
        onChange(optionValue);
      }
    }
    setIsSelectOpen(false);
    setSelectSearch("");
  };

  const handleChange = (e) => {
    if (!onChange) return;
    const callbackSource = onChange.toString();
    const expectsEvent = callbackSource.includes('.target');
    if (expectsEvent) {
      onChange(e);
    } else {
      const val = e.target ? e.target.value : e;
      onChange(val);
    }
  };

  const baseInputClasses = `
    w-full px-3 py-2 text-sm rounded-md border bg-white transition-all duration-200
    focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
    disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed disabled:border-slate-200
    ${error ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : "border-slate-300 hover:border-slate-400"}
  `;

  const renderInput = () => {
    switch (type) {
      case "select":
        if (showSearch) {
          const selectedOption = options.find(opt => opt.value === value);
          return (
            <div ref={selectRef} className="relative">
              <div
                onClick={() => !disabled && setIsSelectOpen(!isSelectOpen)}
                className={`${baseInputClasses} cursor-pointer ${disabled ? "cursor-not-allowed" : ""}`}
                style={style}
              >
                {selectedOption?.label || placeholder || "Seleccionar..."}
              </div>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <FaChevronDown className={`transition-transform ${isSelectOpen ? "rotate-180" : ""}`} size={12} />
              </div>
              {isSelectOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-[1000] max-h-[200px] overflow-y-auto">
                  <div className="sticky top-0 bg-white p-2 border-b border-slate-200">
                    <input
                      type="text"
                      placeholder="Buscar..."
                      value={selectSearch}
                      onChange={(e) => setSelectSearch(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  {filteredOptions.length > 0 ? (
                    filteredOptions.map((option) => (
                      <div
                        key={option.value}
                        onClick={() => handleSelectOptionClick(option.value)}
                        className={`px-3 py-2 cursor-pointer text-sm hover:bg-slate-50 ${option.value === value ? "bg-primary-50 text-primary-600" : "text-slate-700"}`}
                      >
                        {option.label}
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-4 text-center text-slate-400 text-sm">Sin resultados</div>
                  )}
                </div>
              )}
            </div>
          );
        }
        return (
          <div className="relative">
            <select
              value={value}
              onChange={handleChange}
              disabled={disabled}
              required={required}
              className={baseInputClasses}
              style={style}
              {...props}
            >
              {placeholder && <option value="">{placeholder}</option>}
              {options.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <FaChevronDown size={12} />
            </div>
          </div>
        );

      case "textarea":
        return (
          <textarea
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            className={baseInputClasses}
            style={style}
            {...props}
          />
        );

      default:
        return (
          <div className="relative">
            <input
              type={type}
              value={value}
              onChange={handleChange}
              placeholder={placeholder}
              disabled={disabled}
              required={required}
              className={`${baseInputClasses} ${(icon || showSearchIcon) ? "pr-9" : ""}`}
              style={style}
              {...props}
            />
            {(icon || showSearchIcon) && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                {icon || <FaSearch size={14} />}
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      {renderInput()}

      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
      {helpText && !error && <div className="text-xs text-slate-500 mt-1">{helpText}</div>}
    </div>
  );
};