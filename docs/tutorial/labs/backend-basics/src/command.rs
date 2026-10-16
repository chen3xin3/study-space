use serde::Serialize;

use crate::error::AppError;

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct Greeting {
    pub message: String,
}

pub fn greet(name: &str) -> Result<Greeting, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::invalid_name());
    }

    Ok(Greeting {
        message: format!("你好，{name}！"),
    })
}

#[cfg(test)]
mod tests {
    use super::greet;

    #[test]
    fn greeting_trims_the_name() {
        let result = greet("  小林  ").expect("有效姓名应成功");
        assert_eq!(result.message, "你好，小林！");
    }

    #[test]
    fn greeting_rejects_a_blank_name() {
        let error = greet("   ").expect_err("空姓名应被拒绝");
        assert_eq!(error.code, "invalid_name");
    }

    #[test]
    fn greeting_has_a_stable_json_shape() {
        let result = greet("小林").expect("有效姓名应成功");
        let json = serde_json::to_value(result).expect("结果应能序列化");
        assert_eq!(json, serde_json::json!({ "message": "你好，小林！" }));
    }
}
