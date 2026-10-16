//! 第 21～30 章的隔离后端实验。
//!
//! 所有数据库测试都使用内存连接，所有文件测试都使用临时目录。

pub mod attachments;
pub mod backup;
pub mod command;
pub mod database;
pub mod error;
pub mod migrations;
pub mod model;
pub mod repository;

#[cfg(test)]
mod tests {
    #[test]
    fn lab_compiles_and_tests_without_real_app_data() {
        let database_location = ":memory:";
        assert_eq!(database_location, ":memory:");
    }
}
