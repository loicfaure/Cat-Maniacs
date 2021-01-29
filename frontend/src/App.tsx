/* eslint-disable no-use-before-define */
import React, { Component } from 'react'
import { BrowserRouter as Router, Switch, Route, Link } from 'react-router-dom'
import { CatListComponent } from './components/CatListComponent'
import { CatCreationComponent } from './components/CatCreationComponent'
import { CatViewComponent } from './components/CatViewComponent'
import './index.css'

class App extends Component {
  render () {
    return (
      <Router>
        <header className="header">
          <h1>Cha&apos;mania</h1>
          <nav>
            <ul>
              <li><Link to={'/cats'}>Chats</Link></li>
            </ul>
          </nav>
        </header>
        <section className="">
          <Switch>
            <Route exact path='/cats' component={CatListComponent} key="catList"/>
            <Route path="/cats/new" component={CatCreationComponent} key="catView"/>
            <Route path="/cats/:id" component={CatViewComponent} key="catView"/>
          </Switch>
        </section>
        <footer>

        </footer>
      </Router>
    )
  }
}

export default App
