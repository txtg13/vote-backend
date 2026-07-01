const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

function getKey(name) {
  let sum = 0;
  for (let i = 0; i < name.length; i++) {
    sum += name.charCodeAt(i);
  }
  return sum;
}

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit: 10
});

async function initTable() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS students (
      py VARCHAR(100) PRIMARY KEY,
      k BIGINT,
      major VARCHAR(100),
      grade_year INT,
      vote INT,
      si INT,
      story TEXT
    )`);
    
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
    }
  } finally {
    conn.release();
  }
}

app.get('/api/students', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM students");
    res.json({ success: true, data: rows });
  } catch (e) {
    res.json({ success: false, msg: e.message });
  }
});

app.post('/api/vote', async (req, res) => {
  const { name, major, gradeYear, story } = req.body;
  const k = getKey(name);
  
  try {
    const [rows] = await pool.query("SELECT * FROM students WHERE py = ? AND major = ? AND grade_year = ?", [name, major, gradeYear]);
    
    if (rows.length > 0) {
      await pool.query("UPDATE students SET vote = vote + 1 WHERE py = ?", [name]);
      const [updated] = await pool.query("SELECT * FROM students WHERE py = ?", [name]);
      res.json({ success: true, type: 'vote', msg: `✅ 您为 ${name} 同学投票成功！当前票数：${updated[0].vote}`, data: updated[0] });
    } else {
      await pool.query(
        "INSERT INTO students (py, k, major, grade_year, vote, si, story) VALUES (?, ?, ?, ?, 1, 1, ?)",
        [name, k, major, gradeYear, story]
      );
      res.json({ success: true, type: 'nominate', msg: `✅ 恭喜 ${name} 同学被提名为优秀青年候选人，已自动投上第一票！` });
    }
  } catch (e) {
    res.json({ success: false, msg: e.message });
  }
});

app.put('/api/student', async (req, res) => {
  const { name, major, gradeYear, story } = req.body;
  try {
    await pool.query(
      "UPDATE students SET major = ?, grade_year = ?, story = ? WHERE py = ?",
      [major, gradeYear, story, name]
    );
    res.json({ success: true, msg: "✅ 信息更新成功" });
  } catch (e) {
    res.json({ success: false, msg: e.message });
  }
});

app.post('/api/reset', async (req, res) => {
  try {
    await pool.query("DELETE FROM students");
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
      await pool.query(
        "INSERT INTO students (py, k, major, grade_year, vote, si, story) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [item[0], k, item[1], item[2], item[3], item[4], item[5]]
      );
    }
    res.json({ success: true, msg: "✅ 系统已重置！" });
  } catch (e) {
    res.json({ success: false, msg: e.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
  console.log(`服务器运行在端口 ${PORT}`);
  await initTable();
  console.log("数据库初始化完成");
});
