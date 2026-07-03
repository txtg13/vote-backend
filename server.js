const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

function getKey(name) {
  let sum = 0;
  for (let i = 0; i < name.length; i++) {
    sum += name.charCodeAt(i);
  }
  return sum;
}

// 初始化表结构
async function initTable() {
  const conn = await pool.getConnection();
  try {
    // 学生表：姓名+专业+年级 联合主键，支持同名不同专业/年级
    await conn.query(`CREATE TABLE IF NOT EXISTS students (
      py VARCHAR(100) NOT NULL,
      k BIGINT,
      major VARCHAR(100) NOT NULL,
      grade_year INT NOT NULL,
      vote INT DEFAULT 0,
      si INT DEFAULT 1,
      story TEXT,
      PRIMARY KEY (py, major, grade_year)
    )`);

    // 投票日志表：记录IP每日投票次数
    await conn.query(`CREATE TABLE IF NOT EXISTS vote_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ip VARCHAR(50) NOT NULL,
      student_name VARCHAR(100) NOT NULL,
      major VARCHAR(100) NOT NULL,
      grade_year INT NOT NULL,
      vote_date DATE NOT NULL,
      vote_count INT DEFAULT 1,
      UNIQUE KEY unique_ip_student (ip, student_name, major, grade_year, vote_date)
    )`);
    
    // 检查表是否为空，插入初始数据
    const [rows] = await conn.query("SELECT COUNT(*) as count FROM students");
    if (rows[0].count === 0) {
      const initData = [
        ["陈静", "软件工程", 2024, 9, 1, "学习成绩优异，积极参与社团活动"],
        ["杨帆", "网络工程", 2023, 9, 1, "校级奖学金获得者，志愿服务时长超100小时"],
        ["刘伟", "人工智能", 2022, 10, 1, "专业排名前列，获省级竞赛一等奖"],
        ["李华", "计算机科学与技术", 2024, 12, 1, "优秀学生干部，组织多项校园活动"],
        ["赵磊", "数字媒体技术", 2024, 6, 1, "创新创业大赛获奖者"],
        ["周婷", "计算机科学与技术", 2022, 4, 1, "积极参与社会实践"],
        ["吴强", "人工智能", 2024, 3, 1, "乐于助人，团结同学"],
        ["张明", "软件工程", 2023, 14, 1, "专业排名第一，多项竞赛获奖"],
        ["王芳", "数据科学与大数据技术", 2023, 12, 1, "刻苦钻研专业知识，科研成果突出"],
        ["郑雪", "软件工程", 2022, 2, 1, "优秀共青团员"]
      ];
      
      for (let item of initData) {
        const k = getKey(item[0]);
        await conn.query(
          "INSERT INTO students (py, k, major, grade_year, vote, si, story) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [item[0], k, item[1], item[2], item[3], item[4], item[5]]
        );
      }
      console.log("初始数据插入完成");
    }
  } finally {
    conn.release();
  }
}

// 获取所有学生
app.get('/api/students', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM students");
    res.json({ success: true, data: rows });
  } catch (e) {
    res.json({ success: false, msg: e.message });
  }
});

// 投票 / 提名接口（增加IP限制+同名检测）
app.post('/api/vote', async (req, res) => {
  const { name, major, gradeYear, story, confirm = false } = req.body;
  const k = getKey(name);
  // 获取客户端真实IP
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() 
          || req.ip 
          || req.connection.remoteAddress;
  const today = new Date().toISOString().split('T')[0];

  try {
    // 1. 检查今日投票次数限制（每人每天3票）
    const [logRows] = await pool.query(
      "SELECT vote_count FROM vote_logs WHERE ip = ? AND student_name = ? AND major = ? AND grade_year = ? AND vote_date = ?",
      [ip, name, major, gradeYear, today]
    );
    if (logRows.length > 0 && logRows[0].vote_count >= 3) {
      return res.json({ 
        success: false, 
        msg: '❌ 今日您已为该同学投过3票啦，每人每天最多投3票哦～' 
      });
    }

    // 2. 查询是否有完全匹配的学生（姓名+专业+年级）
    const [exactRows] = await pool.query(
      "SELECT * FROM students WHERE py = ? AND major = ? AND grade_year = ?",
      [name, major, gradeYear]
    );

    if (exactRows.length > 0) {
      // 已存在，票数+1
      await pool.query("UPDATE students SET vote = vote + 1 WHERE py = ? AND major = ? AND grade_year = ?", 
        [name, major, gradeYear]);
      
      // 更新投票日志
      await pool.query(`
        INSERT INTO vote_logs (ip, student_name, major, grade_year, vote_date, vote_count)
        VALUES (?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE vote_count = vote_count + 1
      `, [ip, name, major, gradeYear, today]);

      const [updated] = await pool.query(
        "SELECT * FROM students WHERE py = ? AND major = ? AND grade_year = ?",
        [name, major, gradeYear]
      );
      return res.json({ 
        success: true, 
        type: 'vote', 
        msg: `✅ 您为 ${name}（${major} ${gradeYear}级）投票成功！当前票数：${updated[0].vote}`,
        data: updated[0] 
      });
    }

    // 3. 没有完全匹配，检查是否有同名学生
    const [sameNameRows] = await pool.query("SELECT * FROM students WHERE py = ?", [name]);
    if (sameNameRows.length > 0 && !confirm) {
      return res.json({ 
        success: false, 
        needConfirm: true, 
        msg: `⚠️ 系统中已存在同名学生：${sameNameRows[0].py}（${sameNameRows[0].major} ${sameNameRows[0].grade_year}级）`,
        sameNameList: sameNameRows
      });
    }

    // 4. 无同名 / 用户已确认，新增提名
    await pool.query(
      "INSERT INTO students (py, k, major, grade_year, vote, si, story) VALUES (?, ?, ?, ?, 1, 1, ?)",
      [name, k, major, gradeYear, story]
    );
    // 记录首次投票日志
    await pool.query(`
      INSERT INTO vote_logs (ip, student_name, major, grade_year, vote_date, vote_count)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [ip, name, major, gradeYear, today]);

    return res.json({ 
      success: true, 
      type: 'nominate', 
      msg: `✅ 恭喜 ${name}（${major} ${gradeYear}级）被提名为优秀青年候选人，已自动投上第一票！` 
    });

  } catch (e) {
    res.json({ success: false, msg: e.message });
  }
});

// 更新学生信息
app.put('/api/student', async (req, res) => {
  const { name, major, gradeYear, story } = req.body;
  try {
    await pool.query(
      "UPDATE students SET major = ?, grade_year = ?, story = ? WHERE py = ?",
      [major, gradeYear, story, name]
    );
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, msg: e.message });
  }
});

// 重置系统
app.post('/api/reset', async (req, res) => {
  try {
    const conn = await pool.getConnection();
    await conn.query("DROP TABLE IF EXISTS students");
    await conn.query("DROP TABLE IF EXISTS vote_logs");
    conn.release();
    await initTable();
    res.json({ success: true });
  } catch (e) {
    res.json({ success: false, msg: e.message });
  }
});

// 启动服务
const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
  console.log(`服务器运行在端口 ${PORT}`);
  await initTable();
  console.log("数据库初始化完成");
});
