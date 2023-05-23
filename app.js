const express = require("express");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const path = require("path");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const app = express();
app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server is running on http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const verifyPassword = await bcrypt.compare(password, dbUser.password);
    if (verifyPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_CODE");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticationToken = async (request, response, next) => {
  let jwtToken;
  const authHeder = request.headers["authorization"];
  if (authHeder !== undefined) {
    jwtToken = authHeder.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_CODE", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

const stateSnakeToCamel = (database) => {
  return {
    stateId: database.state_id,
    stateName: database.state_name,
    population: database.population,
  };
};

const districtSnakeToCamel = (database) => {
  return {
    districtId: database.district_id,
    districtName: database.district_name,
    stateId: database.state_id,
    cases: database.cases,
    cured: database.cured,
    active: database.active,
    deaths: database.deaths,
  };
};

const reportSnakeToCamel = (database) => {
  return {
    totalCases: database.cases,
    totalCured: database.cured,
    totalActive: database.active,
    totalDeaths: database.deaths,
  };
};

//Get all states API
app.get("/states/", authenticationToken, async (request, response) => {
  const getStatesQuery = ` SELECT * FROM state`;
  const stateList = await db.all(getStatesQuery);
  response.send(stateList.map((eachState) => stateSnakeToCamel(eachState)));
});

// Get state based on stateId API
app.get("/states/:stateId/", authenticationToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
    SELECT * FROM state WHERE state_id = ${stateId}`;
  const getState = await db.get(getStateQuery);
  response.send(stateSnakeToCamel(getState));
});

//Create a district API
app.post("/districts/", authenticationToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const createDistrictQuery = `
  INSERT INTO
    district (district_name, state_id, cases, cured, active, deaths)
  VALUES
    ('${districtName}', 
     '${stateId}', 
     '${cases}', 
     '${cured}', 
     '${active}', 
     '${deaths}');`;
  const newDistrict = await db.run(createDistrictQuery);
  const districtId = newDistrict.lastID;
  response.send("District Successfully Added");
});

// Get district based on districtId API
app.get(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
    SELECT 
      * 
    FROM 
      district 
    WHERE 
      district_id = '${districtId}';`;
    const getDistrict = await db.get(getDistrictQuery);
    response.send(districtSnakeToCamel(getDistrict));
  }
);

//Delete district API
app.delete(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
    DELETE FROM
        district
    WHERE 
        district_id = '${districtId}';`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//Update district details API
app.put(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictQuery = `
    UPDATE 
      district
    SET 
      district_name = '${districtName}',
      state_id = '${stateId}',
      cases = '${cases}',
      cured = '${cured}',
      active = '${active}',
      deaths = '${deaths}'
    WHERE 
      district_id = '${districtId}';`;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

//Get states based on state id API
app.get(
  "/states/:stateId/stats/",
  authenticationToken,
  async (request, response) => {
    const { stateId } = request.params;
    const statsQuery = `
    SELECT SUM(cases) AS cases, 
        SUM(cured) AS cured,
        SUM(active) AS active,
        SUM(deaths) AS deaths
    FROM 
        district
    WHERE
        state_id = '${stateId}';`;
    const stats = await db.get(statsQuery);
    response.send(reportSnakeToCamel(stats));
  }
);

module.exports = app;
