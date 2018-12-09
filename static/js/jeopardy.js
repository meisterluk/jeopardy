// Jeopardy
// MIT License

'use strict';

(function (window) {

  let App = function () {
    let self = this;

    self.teams = [];
    self.rounds = [];
    self.qa = [];
    self.actions = [];
    self.current = {'category': undefined, 'difficulty': undefined};

    // log info, debug, warning or error messages
    self.log = function (msg) {
      if (msg.severity === 'error') {
        alert(msg.message);
      } else if (msg.severity === 'warning') {
        console.warn(msg.message);
      } else if (msg.severity === 'debug') {
        console.debug(msg.message);
      } else if (msg.severity === 'info') {
        console.info(msg.message);
      }
    };

    // Given a string containing questions and answers in our custom plain text format,
    // parse it and return each entry as object. An entry consists of q, a, category
    // and difficulty keys.
    self.readQuestionsTextfile = function (content) {
      self.log({'severity': 'info', 'message': 'readQuestionsTextfile called'});

      let blocks = content.split("\n___\n");
      let output = [];

      for (let block of blocks) {
        let data = {'q': '', 'a': ''};
        let delimiter_found = false;
        for (let line of block.split("\n")) {
          if (/^@category /.exec(line))
            if (!data.category)
              data.category = line.substr(10).trim();
            else
              self.log({'severity': 'error', 'message': 'two @category found in ' + JSON.stringify(data)});
          else if (/^@difficulty /.exec(line))
            if (!data.difficulty)
              data.difficulty = parseInt(line.substr(12).trim());
            else
              self.log({'severity': 'error', 'message': 'two @difficulty found in ' + JSON.stringify(data)});
          else if (/^[ \t]+$/.exec(line) && data.q === '')
            continue;
          else if (!delimiter_found && line === '+++')
            delimiter_found = true;
          else if (!delimiter_found)
            data.q += line + "\n";
          else
            data.a += line + "\n";
        }

        if (data.category === '')
          self.log({'severity': 'error', 'message': 'category must not be empty in ' + JSON.stringify(data)});

        if (!data.q || !data.a || !data.category || data.difficulty === undefined)
          self.log({'severity': 'error', 'message': 'question, answer, category and difficulty must be given; got ' + JSON.stringify(data)});

        output.push(data);
      };

      return output;
    };

    // import question/answer data
    self.importQA = function (qa) {
      self.log({'severity': 'info', 'message': 'importQA called'});

      if (self.rounds.length === 0)
        self.log({'severity': 'error', 'message': 'importQA must be called after importMetadata, not before'});

      let categories = [];
      let difficulties = [];

      for (let entry of qa) {
        if (categories.indexOf(entry.category) === -1)
          categories.push(entry.category);
        if (difficulties.indexOf(entry.difficulty) === -1)
          difficulties.push(entry.difficulty);
      }

      let find = function (cat, diff) {
        for (let entry of qa) {
          if (entry.category === cat && entry.difficulty === diff)
            return true;
        }
        return false;
      };

      for (let cat of categories)
        for (let diff of difficulties) {
          if (!find(cat, diff))
            self.log({
              'severity': 'error',
              'message': 'missing entry for category "' + cat + '" with difficulty ' + diff
            });
        }

      self.qa = qa;
    };

    // update metadata
    self.importMetadata = function (metadata) {
      self.log({'severity': 'info', 'message': 'importMetadata called'});

      if (metadata.teams.length > 4)
        self.log({'severity': 'error', 'message': 'sorry, only up to 4 teams supported'});
      else if (metadata.teams.length === 1)
        self.log({'severity': 'error', 'message': 'cannot import only 1 team'});
      else
        self.teams = metadata.teams;

      if (metadata.rounds.length === 0)
        self.log({'severity': 'error', 'message': 'cannot import zero rounds'});
      else
        self.rounds = metadata.rounds;

      let categories_set = [];
      for (let round of self.rounds) {
        for (let category of round)
          if (categories_set.indexOf(category) !== -1)
            alert("Category '" + category + "' is specified twice! A category must be unique in the entire game.")
      }
    };

    // import an action state
    self.importState = function (state) {
      self.actions = state;

      // determine current round
      let categories_done = [];
      for (let action in self.actions)
        if (categories_done.indexOf(action.category) === -1)
          categories_done.push(action.category);

      let last_round_done;
      for (let round = 0; round < self.rounds.length; round++) {
        let any = false;
        for (let cat of self.rounds[round])
          if (categories_done.indexOf(cat) !== -1)
            any = true;
        if (any)
          last_round_done = round;
      }

      // verify all teams are known
      /// disabled because there is no necessity that all teams are known at initialization
      /*for (let action of self.actions) {
        if (self.teams.indexOf(action.team) === -1)
          self.log({'severity': 'error', 'message': "action mentions team '" + action.team + "', but I only know the teams " + JSON.stringify(self.teams)});
      }*/
    };

    // Initialize this application
    self.in_question = false;
    self.init = function (qa) {
      $("#qa").hide();
      $("#overlay").hide();

      $(window).keypress(function (e) {
        if (e.key === ' ' || e.key === 'Spacebar') {
          if (self.in_question) {
            e.preventDefault();
            self.showA();
          }
        } else if (e.key === 'r' && !$("#overlay").is(":visible")) {
          e.preventDefault();
          self.showRandomizedTeam();
        }
      });

      setTimeout(self.saveState, self.updateInterval);
    };

    // Method called regularly to update
    self.saveState = function () {
      console.log("please override saveState to store the state persistently")
    };

    self.updateUI = function () {
      self.saveState(self.actions);

      // count answered/available questions
      let answered_questions = 0;
      let available_questions = -1;
      if (self.current.round !== undefined) {
        for (let action of self.actions) {
          if (self.rounds[self.current.round].indexOf(action.category) !== -1)
            answered_questions += 1;
        }
        available_questions = self.rounds[self.current.round].length * $(".difficulty").length;
      }

      if (self.current.round !== undefined && answered_questions === available_questions) {
        setTimeout(self.showWinner, 10);
        return;
      }

      $(".teams *").remove();
      $(".diff").remove();
      $("#question").text("");
      $("#answer").text("");
      $(".category").remove();
      $(".qa > *").remove();
      $("#overview button").unbind('click');
      $("#overview > *").remove();

      let round_number = self.current.round;
      if (round_number === undefined)
        round_number = 0;
      $("#round").text(round_number + 1);

      // update teams
      let team_data = {}; // team name : current points
      for (let team_name of self.teams)
        team_data[team_name] = 0;
      for (let action of self.actions) {
        if (self.rounds[round_number].indexOf(action.category) === -1)
          continue;
        if (action.correct)
          team_data[action.team] += action.difficulty;
        else
          team_data[action.team] -= action.difficulty;
      }

      for (let i = 0; i < self.teams.length; i++) {
        let team_name = self.teams[i];
        let t = $("<div></div>");
        t.addClass('team').attr('id', 'team' + i);
        let b = $("<button></button>");
        let t0 = $("<div></div>").addClass("team-name").text(team_name);
        let t1 = $("<div></div>").addClass("team-points").text(team_data[team_name]);
        b.append(t0).append(t1);
        t.append(b);
        $(".teams").append(t);
      }

      $(".teams").css("grid-template-columns", "repeat(" + self.teams.length + ", 1fr)");

      // update categories
      for (let cat of self.rounds[round_number]) {
        let d = $("<div></div>").addClass('category').text(cat);
        $(".categories").append(d);
      }

      $(".categories").css("grid-template-columns", "repeat(" + self.rounds[round_number].length + ", 1fr)");

      // update overview
      let difficulties = [];
      for (let entry of self.qa) {
        if (difficulties.indexOf(entry.difficulty) === -1)
          difficulties.push(entry.difficulty);
      }

      let findAction = function (cat, diff) {
        for (let action of self.actions)
          if (action.category === cat && action.difficulty === diff)
            return action;
      };

      for (let diff of difficulties) {
        let d = $("<div></div>").addClass("difficulty");
        for (let cat of self.rounds[round_number]) {
          let action = findAction(cat, diff);
          let b;
          if (action && action.correct) {
            b = $("<button></button>").addClass('correct-answer').text(action.team + " +" + action.difficulty);
          } else if (action && !action.correct) {
            b = $("<button></button>").addClass('wrong-answer').text(action.team + " -" + action.difficulty);
          } else {
            b = $("<button></button>").text("" + diff);
            b.click((function (c, d) {
              return function () { self.showQ(c, d) }
            })(cat, diff));
          }
          d.append(b);
        }
        $("#overview").append(d);
      }
    };

    self.theme_song_audio = undefined;
    self.theme_song_state = 'silent';
    self.fadeOutThemeSong = function () {
      if (!self.theme_song_audio)
        return;
      if (self.theme_song_state !== 'play')
        return;

      let continue_fade_out = self.theme_song_audio.paused;
      self.theme_song_state = 'fade-out';

      for (let i = 0; i < 20; i++) {
        setTimeout(function (x) {
          if (self.theme_song_state !== 'fade-out' || !continue_fade_out) {
            continue_fade_out = false;
            return;
          }
          self.theme_song_audio.volume = -0.05*x + 1;
        }, 200 * i, i);
      }
      setTimeout(() => {
        if (self.theme_song_state !== 'fade-out' || !continue_fade_out) {
          continue_fade_out = false;
          return;
        }
        self.theme_song_audio.pause();
      }, 8000);
    };

    self.stopThemeSong = function () {
      switch (self.theme_song_state) {
        case 'silent':
          return;
        case 'play':
          self.fadeOutThemeSong();
        case 'fade-out':
          self.theme_song_state = 'silent';
      }

      self.theme_song_audio.pause();
    };

    self.playThemeSong = function () {
      if (self.theme_song_audio === undefined) {
        self.theme_song_audio = new Audio('static/audio/Jeopardy-theme-song.ogg');
        self.theme_song_audio.addEventListener("canplaythrough", function () {
          self.theme_song_audio.play()
        }, true);
        return;
      }
      self.theme_song_state = 'play';
      self.theme_song_audio.pause();
      self.theme_song_audio.play();
      self.theme_song_audio.volume = 1;
      self.theme_song_audio.currentTime = 0;
    };

    self.showQ = function (category, difficulty) {
      self.current.category = category;
      self.current.difficulty = difficulty;

      let entry;
      for (let e of self.qa) {
        if (e.category === category && e.difficulty === difficulty)
          entry = e;
      }
      if (!entry)
        return self.log({'severity': 'error', 'message': 'could not find QA with difficulty ' + difficulty + ' in category "' + category + '"'});

      $("#overview").hide();
      $("#qa").show();

      $("#question").html(entry.q);
      $("#answer").html(entry.a).css('visibility', 'hidden');

      for (let i = 0; i < self.teams.length; i++) {
        $("#team" + i).click(function (i) {
          return function () { self.supplyCorrectA(i) }
        }(i));
      }

      self.playThemeSong();
      self.in_question = true;
    };

    self.showA = function () {
      $("#answer").css('visibility', 'visible');
    };

    self.supplyCorrectA = function (teamid) {
      self.stopThemeSong();
      self.in_question = false;

      // disable buttons
      for (let i = 0; i < self.teams.length; i++) {
        $("#team" + i).attr('onclick', '');
      }

      // store action
      self.actions.push({
        "difficulty": self.current.difficulty,
        "category": self.current.category,
        "team": self.teams[teamid],
        "correct": true
      });

      // go back to overview
      $("#overview").show();
      $("#qa").hide();
      self.updateUI();
    };

    self.startRounds = function () {
      if (self.current.round === undefined)
        self.current.round = 0;
      else
        self.current.round = (self.current.round + 1) % self.rounds.length;

      if (self.teams.length <= 1 || self.teams.length > 4)
        self.askForTeams();
    };

    self.askForTeams = function () {
      $("#overlay").show();
      $("#overlay > *").hide();
      $("#overlay #specify-teams").show();
    };

    self.setTeamNames = function () {
      let teams = $("#specify-teams input").val().split(',').map((s) => s.trim()).filter((v) => !!v);
      if (teams.length <= 1 || teams.length > 4)
        return self.log({'severity': 'error', 'message': 'Sorry, can only handle 2-4 teams'});

      self.teams = teams;
      $("#notification .text").text("" + teams.length + ' teams registered. Have fun in round #' + (self.current.round + 1) + "!");

      $("#specify-teams").hide();
      $("#notification").show();
    };

    self.closeOverlay = function () {
      self.updateUI();
      $("#overlay").hide();
    };

    self.showRandomizedTeam = function () {
      $("#overlay").show();
      $("#overlay > *").hide();
      $("#overlay #randomizer").show();
      $("#randomizer .text").css("text-decoration", "none");

      for (let i = 0; i < 20; i++)
        setTimeout(function () {
          let choice = Math.floor(Math.random() * self.teams.length);
          $("#randomizer .text").text(self.teams[choice]);
        }, Math.floor(Math.exp(0.4 * i)));

      setTimeout(() => $("#randomizer .text").css("text-decoration", "underline"), 3000);
      //setTimeout(() => $("#overlay").hide(), 3000);
    };

    self.showWinner = function () {
      // who has the most points?
      let team_data = {};
      for (let team_name of self.teams)
        team_data[team_name] = 0;
      for (let action of self.actions) {
        if (self.rounds[self.current.round].indexOf(action.category) === -1)
          continue;
        if (action.correct)
          team_data[action.team] += action.difficulty;
        else
          team_data[action.team] -= action.difficulty;
      }
      let name;
      let points = -99999;
      for (let team_name in team_data) {
        if (team_data[team_name] > points) {
          points = team_data[team_name];
          name = team_name;
        }
      }

      // show screen
      $("#overlay").show();
      $("#overlay > *").hide();
      $("#overlay #winner").show();
      $("#winner .text").text(name + " (" + points + " pt)");

      // reset game
      self.teams = [];
    };

    return self;
  };

  window.app = new App();
  window.app.init();
}(window));