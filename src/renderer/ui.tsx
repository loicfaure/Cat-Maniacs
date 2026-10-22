import {
  type ButtonHTMLAttributes,
  type FieldsetHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

function classes(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "light" | "ghost-light" | "danger" | "text";
  size?: "small" | "icon";
  fullWidth?: boolean;
}

export function Button({
  variant = "secondary",
  size,
  fullWidth,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={classes(
        "button",
        variant,
        size === "small" && "tiny",
        size === "icon" && "icon",
        fullWidth && "full",
        className,
      )}
    />
  );
}

export function PageHeader({ children }: { children: ReactNode }) {
  return <div className="section-heading">{children}</div>;
}

export function FilterBar({
  children,
  label = "Filtres",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <div className="filter-bar" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section className={classes("panel", className)} aria-labelledby={headingId}>
      <div className="panel-heading">
        <h2 id={headingId}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  wide,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  wide?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label className={classes("field", wide && "wide", className)} htmlFor={htmlFor}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function FieldGroup({
  label,
  wide,
  children,
  className,
  ...props
}: FieldsetHTMLAttributes<HTMLFieldSetElement> & {
  label: ReactNode;
  wide?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset {...props} className={classes("field-group", wide && "wide", className)}>
      <legend className="field-label">{label}</legend>
      {children}
    </fieldset>
  );
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> {
  children: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  layout?: "inline" | "row";
}

export function Checkbox({
  children,
  description,
  trailing,
  layout = "inline",
  className,
  ...props
}: CheckboxProps) {
  const descriptionId = useId();
  const describedBy = [props["aria-describedby"], description ? descriptionId : undefined]
    .filter(Boolean)
    .join(" ");
  return (
    <label className={classes("checkbox", layout === "row" && "checkbox-row", className)}>
      <input {...props} type="checkbox" aria-describedby={describedBy || undefined} />
      <span className="checkbox-copy">
        <span className="checkbox-label">{children}</span>
        {description && (
          <span className="checkbox-description" id={descriptionId}>
            {description}
          </span>
        )}
      </span>
      {trailing && <span className="checkbox-trailing">{trailing}</span>}
    </label>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="form-actions">{children}</div>;
}

export function RecordLink({
  children,
  onActivate,
  className,
}: {
  children: ReactNode;
  onActivate: () => void;
  className?: string;
}) {
  const activate = (event: { preventDefault(): void; stopPropagation(): void }) => {
    event.preventDefault();
    event.stopPropagation();
    onActivate();
  };
  return (
    <span
      className={classes("record-link", className)}
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          activate(event);
        }
      }}
    >
      {children}
    </span>
  );
}

export function SearchField({
  label,
  trailing,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; trailing?: ReactNode }) {
  return (
    <div className={classes("search-field", className)}>
      <span aria-hidden="true">⌕</span>
      <input {...props} type="search" aria-label={label} />
      {trailing}
    </div>
  );
}

type DatePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  onChange?: (value: string) => void;
};

export function DateInput({ onChange, className, ...props }: DatePickerProps) {
  return (
    <input
      {...props}
      className={classes("date-input", className)}
      type="date"
      lang="fr-FR"
      onChange={(event) => onChange?.(event.currentTarget.value)}
    />
  );
}

export function DateTimeInput({ onChange, className, ...props }: DatePickerProps) {
  return (
    <input
      {...props}
      className={classes("datetime-input", className)}
      type="datetime-local"
      lang="fr-FR"
      onChange={(event) => onChange?.(event.currentTarget.value)}
    />
  );
}

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Inconnu",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr-FR")
      .trim();
  const filtered = options
    .filter((option) => normalize(option).includes(normalize(value)))
    .slice(0, 10);
  const choices = [
    ...filtered.map((option) => ({ label: option, value: option })),
    ...(value.trim() && !options.some((option) => normalize(option) === normalize(value))
      ? [{ label: `Utiliser « ${value.trim()} »`, value: value.trim() }]
      : []),
    { label: "Inconnu", value: "" },
  ];
  const index = Math.min(active, choices.length - 1);
  const select = (next: string) => {
    onChange(next);
    setOpen(false);
    setActive(0);
  };
  return (
    <div className="combobox">
      <input
        {...props}
        value={value}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${index}` : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onChange(event.currentTarget.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            event.preventDefault();
          }
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
            setActive(
              (current) =>
                (current + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length,
            );
          }
          if (event.key === "Enter" && open) {
            event.preventDefault();
            select(choices[index].value);
          }
        }}
      />
      {open && !props.disabled && (
        <div className="combobox-options" role="listbox" id={listId}>
          {choices.map((choice, optionIndex) => (
            <button
              type="button"
              role="option"
              tabIndex={-1}
              id={`${listId}-${optionIndex}`}
              aria-selected={optionIndex === index}
              key={choice.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span {...props} className={classes("badge", tone, className)} />;
}

export function Callout({
  tone = "info",
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & { tone?: Tone }) {
  return <p {...props} className={classes("callout", tone, className)} />;
}

export interface Notice {
  kind: "success" | "error";
  text: string;
}

export function Notification({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 30_000);
    return () => window.clearTimeout(timer);
  }, [notice, onDismiss]);

  return (
    <div className={`notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
      {notice.text}
      <button type="button" onClick={onDismiss} aria-label="Fermer la notification">
        ×
      </button>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <span aria-hidden="true">◇</span>
      <p>{text}</p>
    </div>
  );
}
