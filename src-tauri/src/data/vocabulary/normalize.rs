fn normalize(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

pub fn normalize_word(value: &str) -> String {
    normalize(value)
}

pub fn normalize_meaning(value: &str) -> String {
    normalize(value)
}

pub fn normalize_tag(value: &str) -> String {
    normalize(value)
}

#[cfg(test)]
mod tests {
    use super::{normalize_meaning, normalize_tag, normalize_word};

    #[test]
    fn word_normalization_trims_lowercases_and_collapses_whitespace() {
        assert_eq!(normalize_word("  Take   Off  "), "take off");
    }

    #[test]
    fn meaning_and_tag_normalization_preserve_non_latin_text() {
        assert_eq!(normalize_meaning("  起   飞 "), "起 飞");
        assert_eq!(normalize_tag("  核心   词 "), "核心 词");
    }
}
