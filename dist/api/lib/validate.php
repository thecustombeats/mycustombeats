<?php
/**
 * MCB CRM — input validation.
 *
 * Collects every problem rather than failing on the first, so a customer
 * correcting a form sees all of it at once. Lengths match the schema, so a
 * value that validates here cannot then be truncated by the database.
 */

declare(strict_types=1);

final class Validator
{
    /** @var array<string,string> field => message */
    private array $errors = [];
    private array $data;

    public function __construct(array $data)
    {
        $this->data = $data;
    }

    /** Trimmed string value, or '' when absent. */
    public function str(string $field, int $max = 255): string
    {
        $value = $this->data[$field] ?? '';
        if (!is_scalar($value)) {
            $this->errors[$field] = 'Invalid value.';
            return '';
        }
        $value = trim((string) $value);
        if (mb_strlen($value) > $max) {
            $this->errors[$field] = "Must be $max characters or fewer.";
            return mb_substr($value, 0, $max);
        }
        return $value;
    }

    public function required(string $field, string $label, int $max = 255): string
    {
        $value = $this->str($field, $max);
        if ($value === '') {
            $this->errors[$field] = "$label is required.";
        }
        return $value;
    }

    public function email(string $field, string $label = 'Email'): string
    {
        $value = $this->str($field, 190);
        if ($value === '') {
            $this->errors[$field] = "$label is required.";
            return '';
        }
        if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
            $this->errors[$field] = "Enter a valid email address.";
            return $value;
        }
        return mb_strtolower($value);
    }

    /** Optional free text, null when blank. */
    public function optional(string $field, int $max = 255): ?string
    {
        $value = $this->str($field, $max);
        return $value === '' ? null : $value;
    }

    /**
     * Affiliate username: lowercase alphanumeric only.
     *
     * The same normalisation the client applies, repeated here because the
     * value ends up in a public URL and must not be trusted from the browser.
     */
    public function username(string $field): string
    {
        $raw = $this->str($field, 64);
        $clean = preg_replace('/[^a-z0-9]/', '', mb_strtolower($raw)) ?? '';
        if ($clean === '') {
            $this->errors[$field] = 'Choose a referral name using letters and numbers.';
        } elseif (mb_strlen($clean) < 3) {
            $this->errors[$field] = 'Referral name must be at least 3 characters.';
        }
        return $clean;
    }

    /** Value must appear in $allowed. */
    public function oneOf(string $field, array $allowed, string $label): string
    {
        $value = $this->str($field, 64);
        if ($value === '' || !in_array($value, $allowed, true)) {
            $this->errors[$field] = "$label is not valid.";
            return '';
        }
        return $value;
    }

    public function fail(string $field, string $message): void
    {
        $this->errors[$field] = $message;
    }

    public function hasErrors(): bool
    {
        return $this->errors !== [];
    }

    /** @return array<string,string> */
    public function errors(): array
    {
        return $this->errors;
    }

    /** Sends 422 with every field error, and stops. */
    public function stopIfInvalid(): void
    {
        if ($this->hasErrors()) {
            json_error(422, 'validation_failed', 'Please check the highlighted fields.', [
                'fields' => $this->errors,
            ]);
        }
    }
}
